'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  StudentAuthError, chooseSlot, confirmPayment, getDashboard, getSlotOptions, isPromoCheckout, redeemPromo,
  reportPaymentFailed, startPayment,
} from '../../../../../lib/studentApi';
import { formatFee, hasCourseAccess } from '../../../../../lib/lifecycle';
import { plural } from '../../../../../lib/plural';

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.onload = resolve;
    script.onerror = () => reject(new Error('The payment window could not load. Check your connection and retry.'));
    document.body.appendChild(script);
  });
}

// Enrolment steps after activation: checkout (with failure + retry), then the weekly
// class time, then "You're in" with the assigned cohort.
export default function EnrollPage() {
  const { registrationId } = useParams();
  const router = useRouter();
  const [enrolment, setEnrolment] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    return getDashboard()
      .then((rows) => {
        const row = rows.find((r) => r.id === registrationId);
        if (!row) setError('This enrolment was not found on your account.');
        else if (row.state === 'invited') router.replace('/activate');
        else setEnrolment(row);
      })
      .catch((err) => {
        if (err instanceof StudentAuthError) router.replace('/student/login');
        else setError(err.message);
      });
  }, [registrationId, router]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="sp-narrow-block"><div className="sp-alert" role="alert">{error}</div><Link className="sp-link" href="/student">Back to my classes</Link></div>;
  if (!enrolment) return <p className="sp-muted sp-loading" role="status">Loading…</p>;

  return (
    <div className="sp-narrow-block">
      <div className="sp-page-head">
        <span className="eyebrow">ENROLMENT</span>
        <h1>{enrolment.groupName}</h1>
        <ol className="sp-steps" aria-label="Enrolment steps">
          <li className="is-done">Account</li>
          <li className={['activated', 'payment_pending'].includes(enrolment.state) ? 'is-current' : 'is-done'}>Payment</li>
          <li className={enrolment.state === 'enrolled' ? 'is-current' : hasCourseAccess(enrolment.state) ? 'is-done' : ''}>Class time</li>
          <li className={hasCourseAccess(enrolment.state) ? 'is-current' : ''}>Cohort</li>
        </ol>
      </div>

      {['activated', 'payment_pending'].includes(enrolment.state) && <CheckoutStep enrolment={enrolment} onPaid={load} />}
      {enrolment.state === 'enrolled' && <ChooseClassTime enrolment={enrolment} onChosen={load} />}
      {hasCourseAccess(enrolment.state) && <CohortJoined enrolment={enrolment} />}
    </div>
  );
}

// Paid groups: a promo code while the admin has promo checkout on, otherwise Razorpay.
function CheckoutStep({ enrolment, onPaid }) {
  const free = enrolment.feePaise === 0;
  const [promo, setPromo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (free) return;
    isPromoCheckout().then(setPromo).catch((err) => setError(err.message));
  }, [free]);

  if (free) return <Checkout enrolment={enrolment} onPaid={onPaid} />;
  if (error) return <div className="sp-alert" role="alert">{error}</div>;
  if (promo === null) return <p className="sp-muted sp-loading" role="status">Loading…</p>;
  return promo ? <PromoCheckout enrolment={enrolment} onRedeemed={onPaid} /> : <Checkout enrolment={enrolment} onPaid={onPaid} />;
}

function PromoCheckout({ enrolment, onRedeemed }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await redeemPromo(enrolment.id, code);
      onRedeemed();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="sp-card sp-login" onSubmit={handleSubmit}>
      <h2>Complete enrolment</h2>
      <dl className="sp-facts">
        <div><dt>Program</dt><dd>{enrolment.groupName}</dd></div>
        <div><dt>Duration</dt><dd>{plural(enrolment.durationWeeks, 'week')}</dd></div>
        <div><dt>Program fee</dt><dd>Free with your promo code</dd></div>
      </dl>

      {error && <div className="sp-alert" role="alert">{error}</div>}

      <label className="sp-field">
        <span>Promo code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          minLength={3}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Enter the code from your email"
        />
      </label>

      <button type="submit" className="register-button sp-block" disabled={busy || code.trim().length < 3}>
        {busy ? 'Checking code…' : 'Apply code and enrol'}
      </button>
      <p className="sp-small sp-muted">Your promo code was sent in your invitation email. No payment is needed.</p>
    </form>
  );
}

function Checkout({ enrolment, onPaid }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(enrolment.state === 'payment_pending');
  const free = enrolment.feePaise === 0;

  const pay = async () => {
    setError('');
    setBusy(true);
    try {
      const order = await startPayment(enrolment.id);
      if (order.free) return onPaid();

      await loadCheckout();
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: 'Everyday Mental Wellness',
        description: order.programName,
        prefill: order.prefill,
        theme: { color: '#54dfd7' },
        handler: async (response) => {
          try {
            await confirmPayment(response);
            onPaid();
          } catch (err) {
            setError(err.message);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on('payment.failed', (response) => {
        setFailed(true);
        setBusy(false);
        reportPaymentFailed(order.orderId, response.error?.metadata?.payment_id, response.error?.description).catch(() => {});
      });
      checkout.open();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <section className="sp-card sp-login">
      <h2>Complete enrolment</h2>
      <dl className="sp-facts">
        <div><dt>Program</dt><dd>{enrolment.groupName}</dd></div>
        <div><dt>Duration</dt><dd>{plural(enrolment.durationWeeks, 'week')}</dd></div>
        <div><dt>Program fee</dt><dd>{free ? 'Free' : `${formatFee(enrolment.feePaise, enrolment.currency)} (inclusive)`}</dd></div>
      </dl>

      {failed && !error && (
        <div className="sp-note" role="status">
          Payment pending. Your account and selected program have been saved. You can retry payment without starting again.
        </div>
      )}
      {error && <div className="sp-alert" role="alert">{error}</div>}

      <button type="button" className="register-button sp-block" onClick={pay} disabled={busy}>
        {busy ? 'Opening secure checkout…' : free ? 'Confirm enrolment' : failed ? 'Retry payment' : `Pay ${formatFee(enrolment.feePaise, enrolment.currency)}`}
      </button>
      {!free && <p className="sp-small sp-muted">Secure checkout by Razorpay. A receipt is emailed to you after payment.</p>}
    </section>
  );
}

function ChooseClassTime({ enrolment, onChosen }) {
  const [options, setOptions] = useState(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSlotOptions(enrolment.id).then(setOptions).catch((err) => setError(err.message));
  }, [enrolment.id]);

  const confirm = async () => {
    setError('');
    setBusy(true);
    try {
      await chooseSlot(enrolment.id, selected);
      onChosen();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <section className="sp-card sp-login">
      <h2>Choose your weekly class</h2>
      <p className="sp-muted sp-small">Your cohort meets at the same time every week. Times are India time (IST).</p>
      {error && <div className="sp-alert" role="alert">{error}</div>}
      {!options && !error && <p className="sp-muted" role="status">Loading class times…</p>}

      {options && (
        <div className="sp-slots" role="radiogroup" aria-label="Weekly class time">
          {options.slots.map((slot) => (
            <label key={slot.id} className={`sp-slot ${selected === slot.id ? 'is-selected' : ''}`}>
              <input type="radio" name="slot" value={slot.id} checked={selected === slot.id} onChange={() => setSelected(slot.id)} />
              <span className="sp-slot-label">{slot.label}</span>
              <span className="sp-small sp-muted">{plural(slot.seatsRemaining, 'seat')} remaining · {slot.durationMinutes} min</span>
            </label>
          ))}
        </div>
      )}

      <button type="button" className="register-button sp-block" onClick={confirm} disabled={!selected || busy}>
        {busy ? 'Confirming…' : 'Confirm weekly class time'}
      </button>
      <p className="sp-small sp-muted">
        Once you confirm, you are placed in a cohort. Changing the time after that needs the program team&rsquo;s approval.
      </p>
    </section>
  );
}

function CohortJoined({ enrolment }) {
  return (
    <section className="sp-card sp-login" role="status">
      <span className="eyebrow">COHORT JOINED</span>
      <h2>You&rsquo;re in.</h2>
      <dl className="sp-facts">
        <div><dt>Program</dt><dd>{enrolment.groupName}</dd></div>
        <div><dt>Class time</dt><dd>{enrolment.timeSlotLabel}</dd></div>
        <div><dt>Cohort</dt><dd>{enrolment.cohortCode}</dd></div>
        <div><dt>Seat</dt><dd>{enrolment.seatNumber} of {enrolment.roomCapacity}</dd></div>
      </dl>
      <Link href="/student" className="register-button sp-block">Go to my dashboard →</Link>
    </section>
  );
}
