// Marketing copy for the landing page tiles and the /programs/[slug] overview pages.
// `groupId` links each overview to its registration group in ./programs.js.

const LESSON_FORMAT = 'Each lesson combines a five-minute voiced comic, an eight-question quiz with learning feedback, and a one-minute recap.';
const CERTIFICATE = 'A completion certificate follows the required lessons and quizzes.';
const FOUR_WEEK_CADENCE = 'Daily micro-lessons in week one, followed by weekend sessions in weeks two, three and four.';

export const PROGRAM_PAGES = [
  {
    slug: 'adults',
    groupId: 'group1',
    accent: 'teal',
    title: 'Adults 18+',
    duration: '52 weeks',
    audience: 'Adults who are not parents',
    cardDescription: 'Foundational mental-wellness learning for adults who are not parents.',
    intro: 'Build your understanding of feelings, stress and support from first principles.',
    image: '/everyday/adults.webp',
    imageAlt: 'An adult woman reflecting with a journal in a comfortable room',
    audio: '/everyday/adults.mp3',
    exploreHeading: 'Start with the foundations',
    explore: [
      'Understand feelings and everyday stress',
      'Practise useful habits and communication',
      'Recognise when and how to seek support'
    ],
    routine: [
      'A weekly weekend learning session across 52 weeks.',
      LESSON_FORMAT,
      CERTIFICATE
    ]
  },
  {
    slug: 'parents',
    groupId: 'group2',
    accent: 'amber',
    title: 'Parents',
    duration: '52 weeks',
    audience: 'Parents of minor children',
    cardDescription: 'Ways to listen, respond and support a minor child without diagnosing them.',
    intro: 'Learn ways to listen, respond and support your child without diagnosing them.',
    image: '/everyday/parents.webp',
    imageAlt: 'A parent listening attentively to a child at a table',
    audio: '/everyday/parents.mp3',
    exploreHeading: 'Support your child',
    explore: [
      'Listen and respond with care',
      'Support a child through everyday challenges',
      'Know when to seek qualified help'
    ],
    routine: [
      'A weekly weekend learning session across 52 weeks. The parent is the learner.',
      LESSON_FORMAT,
      CERTIFICATE
    ]
  },
  {
    slug: 'students',
    groupId: 'group3',
    accent: 'violet',
    title: 'Students 18+',
    duration: '4 weeks',
    audience: 'Adult college and university students',
    cardDescription: 'Practical lessons for study, exams, peers and campus life.',
    intro: 'Practical lessons for study, exams, peers and campus life.',
    image: '/everyday/students.webp',
    imageAlt: 'An adult university student studying outdoors on campus',
    audio: '/everyday/students.mp3',
    exploreHeading: 'Find your study rhythm',
    explore: [
      'Navigate study and exam pressure',
      'Build communication and peer support',
      'Develop practical routines for campus life'
    ],
    routine: [FOUR_WEEK_CADENCE, LESSON_FORMAT, CERTIFICATE]
  },
  {
    slug: 'employees',
    groupId: 'group4',
    accent: 'blue',
    title: 'Employees 18+',
    duration: '4 weeks',
    audience: 'Adult staff and employees',
    cardDescription: 'Practical lessons for workload, teams and workplace situations.',
    intro: 'Practical lessons for workload, teams and workplace situations.',
    image: '/everyday/employees.webp',
    imageAlt: 'An adult employee pausing at a desk in a modern workplace',
    audio: '/everyday/employees.mp3',
    exploreHeading: 'Make space in your workday',
    explore: [
      'Manage workload and everyday pressure',
      'Communicate clearly with colleagues',
      'Practise constructive workplace habits'
    ],
    routine: [FOUR_WEEK_CADENCE, LESSON_FORMAT, CERTIFICATE]
  }
];

export function findProgramPage(slug) {
  return PROGRAM_PAGES.find((program) => program.slug === slug) || null;
}
