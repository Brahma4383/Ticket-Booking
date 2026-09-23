import { useEffect } from "react";

import {
  Button,
  Container,
  Footer,
  Navbar,
  SectionHeading,
} from "@/components";
import { ABOUT_MILESTONES, ABOUT_VALUES, BRAND, STATS } from "@/constants";
import { useAuth } from "@/hooks";
import { ArrowRightIcon, MailIcon, PhoneIcon } from "@/icons";
import type { NavTarget } from "@/types/home.types";

import { ContactForm } from "./ContactForm";
import heroBg from "@/assets/hero-bg.jpg";

/**
 * A standalone page, like the account page: it renders its own navbar and
 * footer rather than being a section of the home page, because nothing on it
 * belongs in the booking funnel.
 */
export function About({
  section,
  onExit,
  onNavigate,
  onOpenAccount,
}: {
  /** Which part of the page the Company menu asked for. */
  section?: string;
  /** Back to the home page, top of the search panel. */
  onExit: () => void;
  onNavigate: (target: NavTarget) => void;
  onOpenAccount: () => void;
}) {
  const { requestSignIn } = useAuth();

  // Mounts at the top, then scrolls, because the section does not exist in
  // the document until this page has rendered.
  useEffect(() => {
    if (!section) return;

    const frame = requestAnimationFrame(() => {
      document
        .getElementById(section)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => cancelAnimationFrame(frame);
  }, [section]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar
        onAuth={requestSignIn}
        onOpenAccount={onOpenAccount}
        onNavigate={onNavigate}
        activeMenu="Company"
      />

      <main className="flex-1">
        {/* Header band. Same photo and scrim as the home hero, at roughly
            half the height, so the two pages read as one site. */}
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute inset-0 bg-hero-base">
            <img
              src={heroBg}
              alt=""
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/45" />
            <div className="absolute inset-0 bg-brand-900/20" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent via-canvas/55 to-canvas" />
          </div>

          <Container className="relative pt-16 pb-24 sm:pt-20 sm:pb-28">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.14em] text-hero-fg-soft uppercase">
                About {BRAND.name}
              </p>
              <h1 className="mt-3 text-4xl leading-[1.1] font-extrabold tracking-tight text-hero-fg [text-shadow:0_2px_18px_rgba(0,0,0,0.45)] sm:text-[3rem]">
                A booking company run by people who travel
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-hero-fg-soft [text-shadow:0_1px_10px_rgba(0,0,0,0.5)] sm:text-lg">
                {BRAND.name} started because booking a two-leg trip in India
                meant four websites, three logins and a refund that took a
                month. We put every mode of transport behind one account and
                made the money move as fast as the traveller.
              </p>
            </div>
          </Container>
        </section>

        {/* The numbers sit in their own band, straight under the header, so
            the claims in the copy above have something behind them. */}
        <section className="pb-4">
          <Container>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-hairline shadow-card ring-1 ring-hairline lg:grid-cols-4">
              {STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-surface px-6 py-7 text-center"
                >
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block text-2xl font-extrabold text-ink-900 sm:text-3xl">
                      {stat.value}
                    </span>
                    <span className="mt-1 block text-sm text-ink-500">
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>

        <section id="story" className="scroll-mt-24 py-16 sm:py-20">
          <Container>
            <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-16">
              <div>
                <SectionHeading
                  eyebrow="Our story"
                  title="Built from a missed bus on the Mumbai–Pune road"
                  description="Everything since has come from the same question: what is the traveller stuck with that nobody has bothered to fix?"
                />

                <div className="mt-6 space-y-4 text-[0.95rem] leading-relaxed text-ink-600">
                  <p>
                    In 2018 the three of us paid for a bus, reached the stand
                    and found the operator had resold the seat. The refund
                    arrived five weeks later, after eleven phone calls. The
                    booking was the easy part; everything after it was not.
                  </p>
                  <p>
                    So we built the boring half first. Settlement, refunds, seat
                    inventory that is actually current, and a support desk with
                    the authority to fix a booking rather than escalate it. Only
                    then did we add trains, flights, stays and cabs.
                  </p>
                  <p>
                    Today {BRAND.name} is a team of 240 across Mumbai, Bengaluru
                    and Indore. We still read every one-star review, and the
                    founders still take support shifts during festival weeks.
                  </p>
                </div>
              </div>

              {/* Promises, not product features — hence its own list rather
                  than reusing the home page's feature grid. */}
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {ABOUT_VALUES.map((value) => {
                  const Icon = value.icon;

                  return (
                    <li
                      key={value.title}
                      className="flex gap-4 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-hairline"
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-surface text-brand-fg">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="text-base">{value.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                          {value.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Container>
        </section>

        <section
          id="milestones"
          className="scroll-mt-24 bg-surface-muted py-16 sm:py-20"
        >
          <Container>
            {/* The heading sits *inside* the left column rather than above
                both, so the form starts level with it and fills the space
                beside the heading too. Below `lg` the column collapses and
                the form drops under the timeline, in reading order. */}
            <div className="grid gap-10 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-16">
              <div>
                <SectionHeading
                  eyebrow="Milestones"
                  title="Six years, one route at a time"
                  description="Every step came from something that went wrong for a traveller first."
                />

                <ol className="relative mt-10 border-l border-hairline pl-8 sm:pl-10">
                  {ABOUT_MILESTONES.map((milestone) => (
                    <li
                      key={milestone.year}
                      className="relative pb-10 last:pb-0"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -left-[2.15rem] top-1.5 grid h-4 w-4 place-items-center rounded-full bg-brand-600 ring-4 ring-surface-muted sm:-left-[2.65rem]"
                      />
                      <p className="text-xs font-bold tracking-[0.14em] text-brand-fg uppercase">
                        {milestone.year}
                      </p>
                      <h3 className="mt-2 text-lg">{milestone.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink-500">
                        {milestone.description}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              <div
                id="contact-form"
                className="scroll-mt-24 lg:sticky lg:top-24"
              >
                <ContactForm />
              </div>
            </div>
          </Container>
        </section>

        <section id="contact" className="scroll-mt-24 py-16 sm:py-20">
          <Container>
            <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-12 text-center sm:px-12">
              <h2 className="mx-auto max-w-xl text-3xl tracking-tight text-white sm:text-[2.1rem]">
                Planning something? Start with one search.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-[0.95rem] leading-relaxed text-white/85">
                Compare buses, trains, flights, hotels and cabs side by side,
                then book the whole trip from a single account.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button variant="accent" size="lg" onClick={onExit}>
                  Search journeys
                  <ArrowRightIcon className="h-4 w-4" />
                </Button>
                <a
                  href={`tel:${BRAND.supportPhone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white/90 transition-colors hover:text-white"
                >
                  <PhoneIcon className="h-4 w-4" />
                  {BRAND.supportPhone}
                </a>
                <a
                  href={`mailto:${BRAND.supportEmail}`}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white/90 transition-colors hover:text-white"
                >
                  <MailIcon className="h-4 w-4" />
                  {BRAND.supportEmail}
                </a>
              </div>
            </div>
          </Container>
        </section>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
