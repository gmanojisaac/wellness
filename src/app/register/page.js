'use client';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import '../everyday.css';
import EverydayHeader from '../../components/everyday/EverydayHeader';
import EverydayFooter from '../../components/everyday/EverydayFooter';
import CountryPhoneInput from '../../components/CountryPhoneInput';
import { MIN_PASSWORD_LENGTH } from '../../lib/registrationValidation';
import { signIn } from '../../lib/studentApi';
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

const TIME_SLOTS = [
  { id: 'sat_morning', label: 'Saturday Morning', time: '10:00 AM – 10:10 AM', desc: 'Kick off your weekend with clarity and mindful presence' },
  { id: 'sat_afternoon', label: 'Saturday Afternoon', time: '3:00 PM – 3:10 PM', desc: 'Mid-afternoon reflection break and boundary reset' },
  { id: 'sun_morning', label: 'Sunday Morning', time: '10:00 AM – 10:10 AM', desc: 'Calm Sunday habit before household errands or leisure' },
  { id: 'sun_evening', label: 'Sunday Evening', time: '6:00 PM – 6:10 PM', desc: 'Pre-week cognitive decompression and boundary planning' },
];

const WELLNESS_GOALS = [
  'Managing everyday anxiety & nervous system regulation',
  'Setting healthier boundaries with family or colleagues',
  'Recovering from chronic mental burnout and exhaustion',
  'Improving sleep rituals and end-of-day cognitive shutdown',
  'Parenting communication, co-regulation & calm climate',
  'Overcoming imposter syndrome and study/work procrastination',
  'Building a sustainable 10-minute lifelong mental health habit'
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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [is18OrOver, setIs18OrOver] = useState(true);
  const [phone, setPhone] = useState('');
  const [whatsAppOptIn, setWhatsAppOptIn] = useState(true);
  const [timeSlot, setTimeSlot] = useState('sat_morning');
  const [participationStyle, setParticipationStyle] = useState('active_voice');
  const [primaryGoal, setPrimaryGoal] = useState(WELLNESS_GOALS[0]);
  const [notes, setNotes] = useState('');
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

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters for your student login.`);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('The password and its confirmation do not match.');
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
      password,
      phone: phone.trim(),
      whatsAppOptIn,
      groupId: selectedGroup,
      is18OrOver,
      timeSlot,
      participationStyle,
      primaryGoal,
      notes: notes.trim(),
      agreedToGuidelines
    };

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit registration. Please try again.');
      }

      // Sign the new student in so the success screen can lead straight into the portal
      const didSignIn = await signIn(payload.email, password).then(() => true, () => false);
      setSignedIn(didSignIn);
      setPassword('');
      setConfirmPassword('');
      setRegistrationSuccess(result.registration);
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
          <span>CONFIDENTIAL ADULT PEER COHORT REGISTRATION</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black reg-ink tracking-normal mb-3">
          Join Your <span className="reg-teal">Wellness Cohort</span>
        </h1>
        <p className="reg-muted text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          Reserve your confidential seat in a safe, moderated 6-adult cohort for 10 minutes every weekend. Simple, bite-sized comics and supportive reflection without clinical pressure.
        </p>

        {/* 4-Step Progress Indicator Bar */}
        <div className="mt-7 max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-left">
          <div className="p-2.5 sm:p-3 rounded-xl reg-surface border reg-line shadow-xs flex items-center gap-2.5">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg reg-solid-teal text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0">1</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold reg-teal uppercase tracking-wider block">Step 1</span>
              <span className="text-xs font-bold reg-ink truncate block">Profile</span>
            </div>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl reg-surface border reg-line shadow-xs flex items-center gap-2.5">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg reg-solid-amber text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0">2</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold reg-amber uppercase tracking-wider block">Step 2</span>
              <span className="text-xs font-bold reg-ink truncate block">Track</span>
            </div>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl reg-surface border reg-line shadow-xs flex items-center gap-2.5">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg reg-solid-blue text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0">3</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold reg-blue uppercase tracking-wider block">Step 3</span>
              <span className="text-xs font-bold reg-ink truncate block">Slot</span>
            </div>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl reg-surface border reg-line shadow-xs flex items-center gap-2.5">
            <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg reg-solid-violet text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0">4</span>
            <div className="min-w-0">
              <span className="text-[10px] font-bold reg-violet uppercase tracking-wider block">Step 4</span>
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
        <div className="reg-surface border-2 reg-line-teal rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-md text-center animate-fade-in">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full reg-tint-teal border-2 reg-line-teal flex items-center justify-center mx-auto mb-4 reg-teal shadow-xs">
            <CheckCircle2 className="w-9 h-9 sm:w-11 sm:h-11" />
          </div>

          <span className="inline-block px-3.5 py-1 rounded-full reg-tint-teal reg-teal text-xs font-bold uppercase tracking-wider mb-2">
            Registration Confirmed • Live Seat Allocated
          </span>

          <h2 className="text-2xl sm:text-3xl font-black reg-ink mb-2.5">
            Welcome to the Cohort, {registrationSuccess.fullName}!
          </h2>

          <p className="reg-muted text-xs sm:text-sm max-w-lg mx-auto mb-6 leading-relaxed">
            Your confidential seat has been reserved in our moderated adult peer room. You are all set for your upcoming weekend 10-minute micro-learning session.
          </p>

          {/* Admission Pass Details */}
          <div className="max-w-lg mx-auto reg-surface-soft border reg-line rounded-2xl p-5 sm:p-6 text-left mb-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b reg-line pb-3.5 mb-3.5">
              <div>
                <span className="text-[11px] uppercase font-bold reg-muted tracking-wider block">Registration Reference</span>
                <span className="font-mono font-bold text-base sm:text-lg reg-teal">{registrationSuccess.registrationNumber}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] uppercase font-bold reg-muted tracking-wider block">Status</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold reg-teal reg-tint-teal px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full reg-dot animate-pulse" />
                  Confirmed Seat
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm mb-3.5">
              <div>
                <span className="reg-muted block text-xs font-semibold">Selected Learning Track</span>
                <span className="font-bold reg-ink text-sm sm:text-base block mt-0.5">{registrationSuccess.groupName}</span>
              </div>
              <div>
                <span className="reg-muted block text-xs font-semibold">Assigned Peer Room</span>
                <span className="font-mono font-bold reg-teal text-sm sm:text-base block mt-0.5">
                  {registrationSuccess.cohortCode} (Seat {registrationSuccess.seatNumber} of {registrationSuccess.maxRoomCapacity})
                </span>
              </div>
              <div>
                <span className="reg-muted block text-xs font-semibold">Weekend Time Slot</span>
                <span className="font-semibold reg-ink block mt-0.5">{registrationSuccess.timeSlotLabel}</span>
              </div>
              <div>
                <span className="reg-muted block text-xs font-semibold">Participation Style</span>
                <span className="font-semibold reg-ink block mt-0.5">{registrationSuccess.participationStyleLabel}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="reg-muted block text-xs font-semibold">Registered Contact</span>
                <span className="font-semibold reg-ink block mt-0.5">{registrationSuccess.email}</span>
              </div>
              {registrationSuccess.phone && (
                <div className="sm:col-span-2">
                  <span className="reg-muted block text-xs font-semibold">WhatsApp Reminder</span>
                  <span className="font-semibold reg-ink block mt-0.5">
                    {registrationSuccess.phone} {registrationSuccess.whatsAppOptIn ? '• 1-Minute Alert Enabled' : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t reg-line flex items-center gap-2 text-xs reg-muted">
              <ShieldCheck className="w-4 h-4 reg-teal flex-shrink-0" />
              <span>Peer Room Privacy: Your contact information is never shared with other participants.</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={signedIn ? '/student' : '/student/login'}
              className="register-button gap-2"
            >
              <span>{signedIn ? 'Go to my classes' : 'Sign in to my classes'}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
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
              Register another adult learner
            </button>
          </div>
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
                  Confidential details to setup your personalized peer room credentials.
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
                  This email is also your student portal login.
                </p>
              </div>

              {/* Student login password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-password" className="flex items-center gap-2 text-xs sm:text-sm font-bold reg-ink mb-1.5">
                    <span>Create a Password <span className="reg-danger">*</span></span>
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full h-12 sm:h-[50px] px-4 rounded-xl reg-surface border reg-line reg-ink text-sm sm:text-base transition-all shadow-xs"
                  />
                </div>
                <div>
                  <label htmlFor="reg-password-confirm" className="flex items-center gap-2 text-xs sm:text-sm font-bold reg-ink mb-1.5">
                    <span>Confirm Password <span className="reg-danger">*</span></span>
                  </label>
                  <input
                    id="reg-password-confirm"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full h-12 sm:h-[50px] px-4 rounded-xl reg-surface border reg-line reg-ink text-sm sm:text-base transition-all shadow-xs"
                  />
                </div>
              </div>
              <p className="text-[11px] reg-muted pl-0.5 leading-normal">
                At least {MIN_PASSWORD_LENGTH} characters. You will use your email and this password to sign in and watch your classes.
              </p>

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
                          WhatsApp 1-Minute Session Reminders (Optional)
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full reg-tint-teal reg-teal text-[10px] sm:text-[11px] font-semibold border reg-line">
                          <ShieldCheck className="w-3 h-3 reg-teal" />
                          <span>Spam-Free Guarantee</span>
                        </span>
                      </div>
                      <p className="text-xs reg-muted mt-1 leading-relaxed">
                        Receive a direct 1-tap join link on WhatsApp exactly 1 minute before your scheduled 10-minute weekend room.
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

          {/* STEP 3: SCHEDULE & VOICE STYLE (SKY BLUE & TEAL ACCENTS) */}
          <div className="reg-surface border reg-line rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xs relative">
            <div className="flex items-center gap-3 mb-5 pb-3.5 border-b reg-line">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl reg-tint-blue reg-blue flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
                3
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold reg-ink">
                  Step 3 • Weekend Schedule &amp; Voice Comfort
                </h2>
                <p className="text-xs reg-muted">
                  Pick your preferred 10-minute slot and sharing style.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Weekend Time Slots */}
              <div>
                <label className="block text-xs sm:text-sm font-bold reg-ink mb-2.5">
                  Preferred Weekend 10-Minute Time Slot <span className="reg-danger">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {TIME_SLOTS.map((slot) => {
                    const isSlotSelected = timeSlot === slot.id;
                    return (
                      <div
                        key={slot.id}
                        onClick={() => setTimeSlot(slot.id)}
                        className={`p-4 rounded-xl border-2 text-left cursor-pointer transition-all ${
                          isSlotSelected
                            ? 'reg-tint-blue reg-line-blue shadow-xs'
                            : 'reg-surface reg-line'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-xs sm:text-sm reg-ink">{slot.label}</span>
                          <span className="font-mono text-[11px] font-bold reg-blue reg-surface px-2 py-0.5 rounded border reg-line">
                            {slot.time}
                          </span>
                        </div>
                        <p className="text-xs reg-muted leading-relaxed">{slot.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Participation Style */}
              <div>
                <label className="block text-xs sm:text-sm font-bold reg-ink mb-2.5">
                  Peer Room Participation Comfort Level <span className="reg-danger">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setParticipationStyle('active_voice')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      participationStyle === 'active_voice'
                        ? 'reg-tint-blue reg-line-blue shadow-xs'
                        : 'reg-surface reg-line'
                    }`}
                  >
                    <div className="font-bold text-xs sm:text-sm reg-ink mb-1 flex items-center gap-2">
                      <Mic className="w-4 h-4 reg-blue" />
                      <span>Active Voice Room</span>
                    </div>
                    <p className="text-xs reg-muted leading-relaxed">
                      Happy to share a brief 1-minute comic takeaway in the 4-minute moderated audio room.
                    </p>
                  </div>

                  <div
                    onClick={() => setParticipationStyle('listener_first')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      participationStyle === 'listener_first'
                        ? 'reg-tint-blue reg-line-blue shadow-xs'
                        : 'reg-surface reg-line'
                    }`}
                  >
                    <div className="font-bold text-xs sm:text-sm reg-ink mb-1 flex items-center gap-2">
                      <Headphones className="w-4 h-4 reg-blue" />
                      <span>Listener First Mode</span>
                    </div>
                    <p className="text-xs reg-muted leading-relaxed">
                      Prefer to listen and read along with cohort peers first, speaking only whenever comfortable.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 4: GOALS & COMMUNITY AGREEMENT (LAVENDER & FOREST ACCENTS) */}
          <div className="reg-surface border reg-line rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xs relative">
            <div className="flex items-center gap-3 mb-5 pb-3.5 border-b reg-line">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl reg-tint-violet reg-violet flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
                4
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold reg-ink">
                  Step 4 • Your Goals &amp; Community Guidelines
                </h2>
                <p className="text-xs reg-muted">
                  Tailor your habit and acknowledge safe educational boundaries.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Primary Goal */}
              <div>
                <label className="block text-xs sm:text-sm font-bold reg-ink mb-1.5">
                  Primary Wellness Focus or Behavioral Goal
                </label>
                <select
                  value={primaryGoal}
                  onChange={(e) => setPrimaryGoal(e.target.value)}
                  className="w-full h-12 sm:h-[50px] px-4 rounded-xl reg-surface border reg-line reg-ink text-xs sm:text-sm transition-all shadow-xs"
                >
                  {WELLNESS_GOALS.map((goal, idx) => (
                    <option key={idx} value={goal}>{goal}</option>
                  ))}
                </select>
              </div>

              {/* Optional Accommodations */}
              <div>
                <label className="block text-xs sm:text-sm font-bold reg-ink mb-1.5">
                  Optional Questions or Accommodations
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any accessibility needs, scheduling notes, or questions for your cohort moderator..."
                  className="w-full px-4 py-3 rounded-xl reg-surface border reg-line reg-ink text-xs sm:text-sm transition-all shadow-xs"
                />
              </div>

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
                      <span>Allocating Your Cohort Seat...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm Registration ({activeGroupData.name})</span>
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
                    Instant Cohort Assignment
                  </span>
                  <span className="flex items-center gap-1.5 font-semibold reg-blue">
                    <CheckCircle2 className="w-3.5 h-3.5 reg-blue" />
                    Zero Cost / No Card Required
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
