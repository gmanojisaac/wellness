'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import '../everyday.css';
import EverydayHeader from '../../components/everyday/EverydayHeader';
import EverydayFooter from '../../components/everyday/EverydayFooter';
import CountryPhoneInput from '../../components/CountryPhoneInput';
import { 
  Users, CheckCircle2, ShieldCheck, Sparkles, AlertCircle, 
  Clock, Calendar, MessageSquare, Mail, Phone, User, 
  ArrowRight, RefreshCw, Check, Heart, ShieldAlert, Award, Headphones, Mic
} from 'lucide-react';

const FALLBACK_GROUPS = [
  {
    id: 'group1',
    number: 1,
    name: 'General Adults (18+)',
    title: 'The Resilience Continuum: Foundational Self-Care',
    duration: '52 Weeks • 10 Mins / Weekend',
    cadence: '1 Weekend Lesson per Week',
    cohortSize: 'Max 6 Adults / Room',
    badge: '52 Weeks',
    accentColor: '#54dfd7',
    tagBg: '#54dfd726',
    tagText: '#54dfd7',
    borderActive: 'reg-line-teal',
    bgActive: 'reg-tint-teal',
    focus: 'Emotional regulation, cognitive defusion, and healthy boundaries for lifelong mental wellness.',
    eligibilityNotice: 'Available to any adult aged 18 and above.'
  },
  {
    id: 'group2',
    number: 2,
    name: 'Parents & Caregivers',
    title: 'The Regulated Parent: Co-Regulation & Family Climate',
    duration: '52 Weeks • 10 Mins / Weekend',
    cadence: '1 Weekend Lesson per Week',
    cohortSize: 'Max 6 Parents / Room',
    badge: '52 Weeks',
    accentColor: '#ffc272',
    tagBg: '#ffc27226',
    tagText: '#ffc272',
    borderActive: 'reg-line-amber',
    bgActive: 'reg-tint-amber',
    focus: 'Parental self-regulation, emotion coaching for children, and calm family communication without child diagnosis.',
    eligibilityNotice: 'Exclusively for parents/guardians. Teaches caregiver skills only; never diagnoses minors.'
  },
  {
    id: 'group3',
    number: 3,
    name: 'University & College Students (18+)',
    title: 'Academic Stress, Imposter Syndrome & Social Courage',
    duration: '4 Weeks • 10 Lessons Total',
    cadence: 'Week 1 Daily + Weeks 2–4 Weekend',
    cohortSize: 'Max 6 Students / Room',
    badge: '4 Weeks',
    accentColor: '#bc9dff',
    tagBg: '#bc9dff26',
    tagText: '#bc9dff',
    borderActive: 'reg-line-violet',
    bgActive: 'reg-tint-violet',
    focus: 'Study panic de-escalation, imposter syndrome defusion, roommate communication, and campus isolation relief.',
    eligibilityNotice: 'Exclusively for college and graduate students aged 18+.'
  },
  {
    id: 'group4',
    number: 4,
    name: 'Workplace Professionals',
    title: 'Corporate Burnout Recovery & Work-Life Boundaries',
    duration: '4 Weeks • 10 Lessons Total',
    cadence: 'Week 1 Daily + Weeks 2–4 Weekend',
    cohortSize: 'Max 6 Professionals / Room',
    badge: '4 Weeks',
    accentColor: '#70c6ff',
    tagBg: '#70c6ff26',
    tagText: '#70c6ff',
    borderActive: 'reg-line-blue',
    bgActive: 'reg-tint-blue',
    focus: 'Corporate burnout recovery, asynchronous Slack/email firewalls, and guilt-free boundary formulas.',
    eligibilityNotice: 'For working professionals aged 18+. 100% confidential from employers.'
  }
];

function RegistrationFormInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const groupParam = searchParams.get('group');
  const [groups, setGroups] = useState(FALLBACK_GROUPS);
  const [selectedGroup, setSelectedGroup] = useState(groupParam || FALLBACK_GROUPS[0].id);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Form Fields (Sequential line-by-line)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [is18OrOver, setIs18OrOver] = useState(true);
  const [phone, setPhone] = useState('');
  const [whatsAppOptIn, setWhatsAppOptIn] = useState(true);
  const [agreedToGuidelines, setAgreedToGuidelines] = useState(true);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(null);

  // Fetch groups data from Express backend
  useEffect(() => {
    async function loadGroups() {
      try {
        const res = await fetch('/api/groups');

        if (res.ok) {
          const data = await res.json();
          if (data && data.groups && data.groups.length > 0) {
            // Groups come from the admin panel; colour tokens cycle through the four accents
            const merged = data.groups.map((g, i) => {
              const { accentColor, tagBg, tagText, borderActive, bgActive } = FALLBACK_GROUPS[i % FALLBACK_GROUPS.length];
              return { accentColor, tagBg, tagText, borderActive, bgActive, ...g };
            });
            setGroups(merged);
            setSelectedGroup((current) => (merged.some((g) => g.id === current) ? current : merged[0].id));
          }
        }
      } catch (err) {
        console.warn('Using fallback group list:', err);
      } finally {
        setLoadingGroups(false);
      }
    }
    loadGroups();
  }, []);

  const activeGroupData = groups.find(g => g.id === selectedGroup) || groups[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    // Pre-flight client checks
    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).');
      return;
    }

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid adult email address.');
      return;
    }

    if (!is18OrOver) {
      setErrorMessage('Under-18 registration notice: Everyday Mental Wellness is strictly designed for adults aged 18 and older. If you or a minor needs immediate emotional support, please call Tele-MANAS (14416 / 1800-891-4416), Childline (1098), or dial 112 (India). (International: 988).');
      return;
    }

    if (!agreedToGuidelines) {
      setErrorMessage('Please confirm that you agree to the peer community guidelines and understand this is an educational program, not clinical therapy.');
      return;
    }

    setSubmitting(true);

    const payload = {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      whatsAppOptIn,
      groupId: selectedGroup,
      is18OrOver,
      agreedToGuidelines
    };

    try {
      const response = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit registration. Please try again.');
      }

      setRegistrationSuccess({ fullName: payload.fullName, email: payload.email, groupName: activeGroupData.name });
      window.scrollTo({ top: 80, behavior: 'smooth' });
    } catch (err) {
      console.error('Registration submission error:', err);
      setErrorMessage(err.message || 'Network error connecting to registration server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6">
      
      {/* Decorative Top Badge & Hero Header */}
      <div className="text-center mb-8 sm:mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full reg-tint-teal border reg-line reg-ink text-xs font-bold mb-3.5 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 reg-teal" />
          <span>ENROLMENT INTEREST · NO CARD NEEDED</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black reg-ink tracking-normal mb-3">
          Join Your <span className="reg-teal">Wellness Cohort</span>
        </h1>
        <p className="reg-muted text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          Tell us which program you would like to join. We will email you a secure link to activate your learner account. You choose your weekly class time after enrolment.
        </p>

        {/* 4-Step Progress Indicator Bar */}
        <div className="mt-7 max-w-2xl mx-auto grid grid-cols-3 gap-2.5 text-left">
          <div className="p-2.5 sm:p-3 rounded-xl reg-surface border reg-line shadow-xs flex items-center gap-2.5">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg reg-solid-teal text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0">1</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold reg-teal uppercase tracking-wider block">Step 1</span>
              <span className="text-xs font-bold reg-ink truncate block">Details</span>
            </div>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl reg-surface border reg-line shadow-xs flex items-center gap-2.5">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg reg-solid-amber text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0">2</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold reg-amber uppercase tracking-wider block">Step 2</span>
              <span className="text-xs font-bold reg-ink truncate block">Program</span>
            </div>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl reg-surface border reg-line shadow-xs flex items-center gap-2.5">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg reg-solid-violet text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0">3</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold reg-violet uppercase tracking-wider block">Step 3</span>
              <span className="text-xs font-bold reg-ink truncate block">Confirm</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert Box */}
      {errorMessage && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl reg-tint-danger border reg-line-danger reg-danger text-sm flex items-start gap-3 shadow-xs animate-fade-in">
          <AlertCircle className="w-5 h-5 reg-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="block font-bold text-sm sm:text-base mb-0.5">Please review your information:</strong>
            <span className="leading-relaxed text-xs sm:text-sm">{errorMessage}</span>
          </div>
        </div>
      )}

      {/* SUCCESS CONFIRMATION STATE */}
      {registrationSuccess ? (
        <div className="reg-surface border-2 reg-line-teal rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-md text-center animate-fade-in" role="status">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full reg-tint-teal border-2 reg-line-teal flex items-center justify-center mx-auto mb-4 reg-teal shadow-xs">
            <Mail className="w-9 h-9 sm:w-11 sm:h-11" />
          </div>

          <span className="inline-block px-3.5 py-1 rounded-full reg-tint-teal reg-teal text-xs font-bold uppercase tracking-wider mb-2">
            Interest received
          </span>

          <h2 className="text-2xl sm:text-3xl font-black reg-ink mb-2.5">
            Thank you, {registrationSuccess.fullName}.
          </h2>

          <p className="reg-muted text-sm max-w-lg mx-auto mb-6 leading-relaxed">
            Check your email to activate your learner account. We sent a secure, single-use link to{' '}
            <strong className="reg-ink">{registrationSuccess.email}</strong> for <strong className="reg-ink">{registrationSuccess.groupName}</strong>.
            The link expires after a short time; if it does, you can ask for a new one on the activation page.
          </p>

          <div className="max-w-lg mx-auto reg-surface-soft border reg-line rounded-2xl p-5 text-left mb-6 shadow-xs text-xs sm:text-sm reg-muted space-y-2">
            <p className="font-bold reg-ink">What happens next</p>
            <p>1. Open the email and create your own password. We never email you a password.</p>
            <p>2. Confirm your mobile / WhatsApp number and accept the program terms.</p>
            <p>3. Complete enrolment, then choose your weekly class time to join a cohort.</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setRegistrationSuccess(null);
              setFullName('');
              setEmail('');
              setPhone('');
            }}
            className="text-xs reg-muted underline px-2 py-1.5 cursor-pointer"
          >
            Use a different email
          </button>
        </div>
      ) : (
        /* SPACIOUS, POLISHED SEQUENTIAL REGISTRATION FORM */
        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">

          {/* STEP 1: LEARNER DETAILS (FRESH MINT / SAGE ACCENTS) */}
          <div className="reg-surface border reg-line rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xs relative">
            <div className="flex items-center gap-3 mb-5 pb-3.5 border-b reg-line">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl reg-tint-teal reg-teal flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
                1
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold reg-ink">
                  Step 1 • Your Learner Information
                </h2>
                <p className="text-xs reg-muted">
                  Your name and contact details. You create your password after opening the activation email.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Full Name */}
              <div>
                <label className="flex items-center gap-2 text-xs sm:text-sm font-bold reg-ink mb-1.5">
                  <User className="w-4 h-4 reg-teal" />
                  <span>Full / Preferred Name <span className="reg-danger">*</span></span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full h-12 sm:h-[50px] px-4 rounded-xl reg-surface border reg-line reg-ink text-sm sm:text-base transition-all shadow-xs"
                />
              </div>

              {/* Email Address */}
              <div>
                <label className="flex items-center gap-2 text-xs sm:text-sm font-bold reg-ink mb-1.5">
                  <Mail className="w-4 h-4 reg-teal" />
                  <span>Confidential Email Address <span className="reg-danger">*</span></span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex.morgan@domain.com"
                  className="w-full h-12 sm:h-[50px] px-4 rounded-xl reg-surface border reg-line reg-ink text-sm sm:text-base transition-all shadow-xs"
                />
                <p className="text-[11px] reg-muted mt-1 pl-0.5 leading-normal">
                  We send your activation link here. It also becomes your learner login.
                </p>
              </div>

              {/* Age 18+ Confirmation Card */}
              <div className="p-4 sm:p-4.5 rounded-xl reg-surface-soft border reg-line flex items-start gap-3">
                <input
                  type="checkbox"
                  id="age-verify-checkbox"
                  checked={is18OrOver}
                  onChange={(e) => setIs18OrOver(e.target.checked)}
                  className="mt-0.5 w-4.5 h-4.5 rounded reg-line-teal reg-teal cursor-pointer flex-shrink-0"
                />
                <div>
                  <label htmlFor="age-verify-checkbox" className="cursor-pointer select-none">
                    <span className="text-xs sm:text-sm font-bold reg-teal block">
                      Adult Learner Verification (Age 18+) <span className="reg-danger">*</span>
                    </span>
                    <span className="text-xs reg-muted block mt-0.5 leading-relaxed">
                      I confirm that I am 18 years of age or older. Everyday Mental Wellness is strictly structured for adult participants.
                    </span>
                  </label>
                </div>
              </div>

              {/* WhatsApp Notification Card */}
              <div className="p-4 sm:p-5 rounded-xl reg-surface-soft border reg-line transition-all">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="whatsapp-optin-checkbox"
                    checked={whatsAppOptIn}
                    onChange={(e) => setWhatsAppOptIn(e.target.checked)}
                    className="mt-0.5 w-4.5 h-4.5 rounded reg-line reg-teal cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <label htmlFor="whatsapp-optin-checkbox" className="cursor-pointer select-none block">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold reg-ink">
                          WhatsApp class reminders (optional)
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full reg-tint-teal reg-teal text-[10px] sm:text-[11px] font-semibold border reg-line">
                          <ShieldCheck className="w-3 h-3 reg-teal" />
                          <span>Spam-Free Guarantee</span>
                        </span>
                      </div>
                      <p className="text-xs reg-muted mt-1 leading-relaxed">
                        Get a secure join link on WhatsApp 2 minutes before each live class. You confirm this number when you activate your account.
                      </p>
                    </label>

                    {/* Integrated Standardized Phone Input */}
                    {whatsAppOptIn && (
                      <div className="mt-3.5 pt-3.5 border-t reg-line max-w-md">
                        <label htmlFor="reg-phone-input" className="block text-xs font-semibold reg-ink mb-1.5">
                          Mobile Phone Number
                        </label>
                        <CountryPhoneInput
                          id="reg-phone-input"
                          value={phone}
                          onChange={(val) => setPhone(val)}
                          placeholder="98765 43210"
                          helperText="India (+91) selected by default. Enter your 10-digit mobile number."
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 2: CHOOSE YOUR LEARNING GROUP (WARM AMBER / DISTINCT TRACK COLORS) */}
          <div className="reg-surface border reg-line rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xs relative">
            <div className="flex items-center justify-between mb-5 pb-3.5 border-b reg-line">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl reg-tint-amber reg-amber flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
                  2
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold reg-ink">
                    Step 2 • Choose Your Adult Cohort Track
                  </h2>
                  <p className="text-xs reg-muted">
                    Select the specific curriculum built for your adult life stage.
                  </p>
                </div>
              </div>

              {loadingGroups && (
                <span className="text-xs reg-muted flex items-center gap-1.5 reg-surface-soft px-2.5 py-1 rounded-full border reg-line">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin reg-amber" /> Syncing...
                </span>
              )}
            </div>

            <div className="space-y-3.5">
              {groups.map((grp) => {
                const isSelected = selectedGroup === grp.id;
                return (
                  <div
                    key={grp.id}
                    onClick={() => setSelectedGroup(grp.id)}
                    className={`p-4 sm:p-5 rounded-xl border-2 text-left cursor-pointer transition-all ${
                      isSelected
                        ? `${grp.borderActive} ${grp.bgActive} shadow-xs ring-1 ring-opacity-20`
                        : 'reg-surface reg-line'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div 
                          className="w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0"
                          style={{ borderColor: grp.accentColor, backgroundColor: isSelected ? grp.accentColor : 'transparent' }}
                        >
                          {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                        </div>
                        <span 
                          className="font-bold text-[11px] px-2.5 py-0.5 rounded-full border flex-shrink-0"
                          style={{ backgroundColor: grp.tagBg, color: grp.tagText, borderColor: grp.accentColor + '40' }}
                        >
                          Group {grp.number} • {grp.badge}
                        </span>
                        <h3 className="font-bold text-sm sm:text-base reg-ink truncate">
                          {grp.name}
                        </h3>
                      </div>

                      {/* Live Seat Pulse Tag */}
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full reg-surface border reg-line reg-ink flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full reg-dot animate-pulse" />
                        {grp.availableSeats !== undefined ? `${grp.availableSeats} of ${grp.maxRoomCapacity} seats open` : grp.cohortSize}
                      </span>
                    </div>

                    <p className="text-xs font-semibold pl-7 mb-1" style={{ color: grp.accentColor }}>
                      {grp.title}
                    </p>
                    <p className="text-xs reg-muted pl-7 leading-relaxed mb-2.5">
                      {grp.focus}
                    </p>

                    <div className="pl-7 flex items-center justify-between text-xs reg-muted pt-2 border-t reg-line">
                      <span className="font-medium flex items-center gap-1.5 text-[11px]">
                        <Clock className="w-3.5 h-3.5" style={{ color: grp.accentColor }} />
                        {grp.duration}
                      </span>
                      <span className="font-medium reg-teal text-[11px]">
                        {grp.cadence}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedGroup === 'group2' && (
              <div className="mt-3.5 p-3.5 rounded-xl reg-tint-amber border reg-line-amber text-xs reg-amber flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 reg-amber flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  <strong>Caregiver Scope Notice:</strong> This track equips parents and caregivers with supportive communication and emotional climate tools. It strictly does not diagnose minor children or create child accounts.
                </span>
              </div>
            )}
          </div>

          {/* STEP 3: COMMUNITY AGREEMENT (LAVENDER & FOREST ACCENTS) */}
          <div className="reg-surface border reg-line rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xs relative">
            <div className="flex items-center gap-3 mb-5 pb-3.5 border-b reg-line">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl reg-tint-violet reg-violet flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
                3
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold reg-ink">
                  Step 3 • Community Guidelines
                </h2>
                <p className="text-xs reg-muted">
                  Acknowledge safe educational boundaries. No payment is taken on this page.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Community & Safety Agreement */}
              <div className="p-4 sm:p-5 rounded-xl reg-surface-soft border reg-line">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={agreedToGuidelines}
                    onChange={(e) => setAgreedToGuidelines(e.target.checked)}
                    className="mt-0.5 w-4.5 h-4.5 rounded reg-line reg-teal cursor-pointer flex-shrink-0"
                  />
                  <div>
                    <span className="text-xs sm:text-sm font-bold reg-ink block">
                      Community Agreement &amp; Educational Scope Acknowledgment <span className="reg-danger">*</span>
                    </span>
                    <span className="text-xs reg-muted block mt-1 leading-relaxed">
                      I understand that Everyday Mental Wellness is an educational micro-learning program and does not provide psychotherapy, medical treatment, or emergency crisis intervention. For urgent crises in India, immediate 24/7 support is available via Tele-MANAS (14416 / 1800-891-4416), KIRAN (1800-599-0019), or 112. (International: 988).
                    </span>
                  </div>
                </label>
              </div>

              {/* Prominent High-Contrast Submit CTA */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="reg-submit w-full rounded-xl text-sm sm:text-base font-bold flex items-center justify-center gap-2.5"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Sending your activation link...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Enrollment ({activeGroupData.name})</span>
                      <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </>
                  )}
                </button>

                {/* Trust Badges */}
                <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-3.5 text-xs reg-muted">
                  <span className="flex items-center gap-1.5 font-semibold reg-teal">
                    <ShieldCheck className="w-3.5 h-3.5 reg-teal" />
                    100% Confidential
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold reg-amber">
                    <Sparkles className="w-3.5 h-3.5 reg-amber" />
                    Activation link by email
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold reg-blue">
                    <CheckCircle2 className="w-3.5 h-3.5 reg-blue" />
                    No card needed now
                  </span>
                </div>
              </div>
            </div>
          </div>

        </form>
      )}

      {/* Safety Signpost Bar */}
      <div className="mt-10 text-center text-xs sm:text-sm reg-muted flex items-center justify-center gap-2">
        <ShieldCheck className="w-4 h-4 reg-teal" />
        <span>In crisis in India? Call <strong>14416</strong> (Tele-MANAS, 24/7 Free) or dial <strong>112</strong>. International: Call or text <strong>988</strong> for suicide and mental health lifeline support.</span>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="everyday register">
      <a className="skip" href="#main">Skip to content</a>
      <EverydayHeader />
      <main id="main" className="py-6">
        <Suspense fallback={<div className="container py-20 text-center reg-muted">Loading Group Registration...</div>}>
          <RegistrationFormInner />
        </Suspense>
      </main>
      <EverydayFooter />
    </div>
  );
}
