import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import '../../everyday.css';
import EverydayHeader from '../../../components/everyday/EverydayHeader';
import EverydayFooter from '../../../components/everyday/EverydayFooter';
import ListenButton from '../../../components/everyday/ListenButton';
import { PROGRAM_PAGES, findProgramPage } from '../../../lib/programPages';

export const dynamicParams = false;

export function generateStaticParams() {
  return PROGRAM_PAGES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const program = findProgramPage(slug);
  if (!program) return {};
  return {
    title: `${program.title} | Everyday`,
    description: program.intro,
  };
}

export default async function ProgramPage({ params }) {
  const { slug } = await params;
  const program = findProgramPage(slug);
  if (!program) notFound();

  const otherPrograms = PROGRAM_PAGES.filter((other) => other.slug !== program.slug);

  return (
    <div className="everyday">
      <a className="skip" href="#main">Skip to content</a>

      <EverydayHeader registerHref={`/register?group=${program.groupId}`} />

      <main id="main" className={`detail ${program.accent}`}>
        <Link className="back-link" href="/#programs">Back to all programs</Link>

        <section className="detail-hero">
          <div className="detail-text">
            <span className="eyebrow">{program.duration} · {program.audience}</span>
            <h1>{program.title}</h1>
            <p className="detail-intro">{program.intro}</p>
            <ListenButton src={program.audio} programName={program.title} />
          </div>
          <Image
            src={program.image}
            alt={program.imageAlt}
            width={1600}
            height={1195}
            sizes="(max-width: 600px) 100vw, 50vw"
            loading="eager"
          />
        </section>

        <section className="detail-info">
          <div>
            <span className="eyebrow">WHAT YOU’LL EXPLORE</span>
            <h2>{program.exploreHeading}</h2>
            <ul>
              {program.explore.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <span className="eyebrow">YOUR LEARNING ROUTINE</span>
            <h2>Brief, guided sessions</h2>
            {program.routine.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </section>

        <section className="other-programs">
          <h2>Explore the other paths</h2>
          <div>
            {otherPrograms.map((other) => (
              <Link key={other.slug} href={`/programs/${other.slug}`}>{other.title}</Link>
            ))}
          </div>
        </section>
      </main>

      <EverydayFooter />
    </div>
  );
}
