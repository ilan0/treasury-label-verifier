import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon,
  BatchIcon,
  CheckIcon,
  ExternalIcon,
  ReviewIcon,
  ShieldIcon,
  SparkIcon,
  WarningIcon,
} from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Methodology · ProofCheck",
  description:
    "How ProofCheck extracts evidence and applies source-linked alcohol label checks.",
};

const profiles = [
  {
    title: "Distilled spirits",
    law: "27 CFR Parts 5 and 16",
    checks:
      "Brand, class/type, ABV and proof, net contents, responsible party, origin, age and conditional disclosures.",
  },
  {
    title: "Wine · 7% ABV or more",
    law: "27 CFR Parts 4 and 16",
    checks:
      "Identity, class/type, alcohol, appellation and varietal conditions, volume, bottler/importer, origin and disclosures.",
  },
  {
    title: "Malt beverages",
    law: "27 CFR Parts 7 and 16",
    checks:
      "Brand, class/type, alcohol when required or declared, net contents, bottler/importer, origin and health warning.",
  },
  {
    title: "Other fermented products",
    law: "IRC/ABLA plus FDA jurisdiction",
    checks:
      "Products outside FAA definitions are identified and sent to classification review instead of applying the wrong rule set.",
  },
];

const sources = [
  {
    label: "Wine labeling regulations",
    detail: "27 CFR Part 4",
    url: "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-4",
  },
  {
    label: "Distilled spirits labeling regulations",
    detail: "27 CFR Part 5",
    url: "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-5",
  },
  {
    label: "Malt beverage labeling regulations",
    detail: "27 CFR Part 7",
    url: "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-7",
  },
  {
    label: "Alcoholic beverage health warning",
    detail: "27 CFR Part 16",
    url: "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16",
  },
  {
    label: "TTB Label Approval Basics",
    detail: "Coverage and jurisdiction",
    url: "https://www.ttb.gov/public-information/featured-stories/ttb-label-approval-basics",
  },
  {
    label: "TTB wine mandatory information checklist",
    detail: "Current beverage-specific guidance",
    url: "https://www.ttb.gov/system/files/images/wine-label/wine-labeling-checklist.pdf",
  },
  {
    label: "TTB distilled spirits checklist",
    detail: "Current beverage-specific guidance",
    url: "https://www.ttb.gov/system/files/images/labeling-ds/ds-labeling-checklist.pdf",
  },
  {
    label: "TTB malt beverage checklist",
    detail: "Current beverage-specific guidance",
    url: "https://www.ttb.gov/system/files/images/beer/labeling/malt-beverage-labeling-checklist-information.pdf",
  },
];

export default function MethodologyPage() {
  return (
    <div>
      <section className="method-hero">
        <div className="shell method-hero-grid">
          <div>
            <p className="eyebrow">
              <ShieldIcon size={17} /> Transparent by design
            </p>
            <h1>
              AI reads the evidence.
              <br />
              Deterministic rules evaluate it.
            </h1>
            <p>
              ProofCheck separates extraction from compliance logic so every
              automated finding can show what was expected, what was observed,
              and which official source governs the check.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/submit">
                Start a verification <ArrowIcon size={17} />
              </Link>
              <Link className="button button-secondary" href="/">
                Run an example
              </Link>
            </div>
          </div>
          <div className="method-flow" aria-label="ProofCheck evaluation flow">
            <div>
              <span>
                <SparkIcon />
              </span>
              <strong>Extract</strong>
              <small>
                OpenAI vision returns structured evidence, never a legal
                decision.
              </small>
            </div>
            <i />
            <div>
              <span>
                <CheckIcon />
              </span>
              <strong>Evaluate</strong>
              <small>
                Versioned TypeScript rules compare application facts and
                requirements.
              </small>
            </div>
            <i />
            <div>
              <span>
                <ReviewIcon />
              </span>
              <strong>Route</strong>
              <small>
                Uncertain, unreadable, or unassessable evidence goes to a
                person.
              </small>
            </div>
          </div>
        </div>
      </section>
      <section className="section shell methodology-body">
        <div className="method-intro">
          <div>
            <p className="kicker">Ruleset 2026-07-31.1</p>
            <h2>Beverage-specific coverage</h2>
          </div>
          <p>
            Alcohol labeling jurisdiction is conditional. ProofCheck selects a
            profile from the submitted product facts, and it exposes
            classification uncertainty rather than quietly applying a nearby
            rule.
          </p>
        </div>
        <div className="profile-grid">
          {profiles.map((profile) => (
            <article key={profile.title}>
              <span>{profile.title.slice(0, 1)}</span>
              <div>
                <h3>{profile.title}</h3>
                <strong>{profile.law}</strong>
                <p>{profile.checks}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section section-tinted">
        <div className="shell split-section">
          <div>
            <p className="kicker">Confidence policy</p>
            <h2>Conservative routing prevents false certainty.</h2>
            <p>
              A confidence value summarizes evidence quality; it is not a
              calibrated probability of legal compliance.
            </p>
          </div>
          <div className="confidence-policy">
            <div className="policy-pass">
              <strong>90–100</strong>
              <div>
                <span>
                  <CheckIcon size={16} />
                  Pre-check passed
                </span>
                <p>
                  Every applicable automated mandatory check is assessed and
                  passes with high-confidence evidence.
                </p>
              </div>
            </div>
            <div className="policy-review">
              <strong>0–89</strong>
              <div>
                <span>
                  <ReviewIcon size={16} />
                  Human review
                </span>
                <p>
                  Any ambiguity, unreadable field, unresolved classification,
                  fuzzy difference, or unassessable mandatory fact.
                </p>
              </div>
            </div>
            <div className="policy-fail">
              <strong>Any</strong>
              <div>
                <span>
                  <WarningIcon size={16} />
                  Correction needed
                </span>
                <p>
                  A deterministic mandatory check finds a clear discrepancy or
                  missing statement.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="section shell assessment-grid">
        <div>
          <p className="kicker">What the prototype assesses</p>
          <h2>High-value checks with visible evidence</h2>
          <ul className="check-list">
            {[
              "Application-to-artwork field matching",
              "Exact government warning wording and heading case",
              "ABV/proof and volume consistency",
              "Conditional disclosures declared in the application",
              "Panel co-occurrence and same-field-of-vision evidence",
              "Imported origin and responsible-party statements",
            ].map((item) => (
              <li key={item}>
                <CheckIcon size={17} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="boundary-card">
          <WarningIcon size={24} />
          <h3>Assessment boundaries</h3>
          <p>ProofCheck does not infer facts that artwork cannot establish.</p>
          <ul>
            <li>
              <strong>Physical type size</strong> requires scale, dimensions, or
              print-ready DPI.
            </li>
            <li>
              <strong>Formula and production facts</strong> require underlying
              records.
            </li>
            <li>
              <strong>Legibility under glare or blur</strong> is routed to
              review.
            </li>
            <li>
              <strong>Special claims and state law</strong> are outside the
              initial automated catalog.
            </li>
          </ul>
          <p>
            These become <b>Not assessed</b>, never silent passes.
          </p>
        </div>
      </section>
      <section className="section section-tinted">
        <div className="shell assessment-grid">
          <div>
            <p className="kicker">Five-second latency program</p>
            <h2>A measured fast path—not a simulated result.</h2>
            <p>
              Routine single-image submissions still enter the durable queue. A
              compact, profile-aware extraction reads only the evidence that can
              affect the submitted product. If critical evidence is missing,
              inconsistent, unreadable, or visually difficult, the worker
              automatically uses the thorough vision path instead of guessing.
            </p>
            <p>
              ProofCheck records queue, preprocessing, provider, verification,
              persistence, model, strategy, and token provenance for each
              processing attempt. Sanitized timing appears beside completed
              review results.
            </p>
          </div>
          <div className="boundary-card">
            <SparkIcon size={24} />
            <h3>Cache provenance stays visible</h3>
            <p>
              Exact repeats can reuse a versioned, content-addressed extraction
              while the deterministic rules run again. Custom reuse is isolated
              to the user session; built-in examples may reuse disclosed
              global fixtures.
            </p>
            <ul>
              <li>
                Cache keys include artwork, application facts, model, prompt,
                schema, and image strategy.
              </li>
              <li>Any version change invalidates the previous extraction.</li>
              <li>
                First live scans and cache hits are benchmarked separately.
              </li>
            </ul>
          </div>
        </div>
      </section>
      <section className="section section-navy">
        <div className="shell batch-method">
          <div>
            <BatchIcon size={30} />
            <p className="kicker">Durable async architecture</p>
            <h2>One batch. Independent jobs.</h2>
            <p>
              Submissions return immediately. Inngest processes each label set
              independently with concurrency limits, retry classification, and
              idempotent steps. Postgres—not browser memory—is the source of
              truth.
            </p>
            <p>
              Individual examples run live OpenAI vision extraction. The
              250-item stress example transparently replays versioned,
              pre-validated extraction fixtures through the same durable queue
              and deterministic rule engine, avoiding 250 unnecessary model
              calls.
            </p>
          </div>
          <div className="batch-method-list">
            <span>
              <i>01</i>
              <strong>Up to 300 applications validated together</strong>
            </span>
            <span>
              <i>02</i>
              <strong>Five extraction jobs active globally</strong>
            </span>
            <span>
              <i>03</i>
              <strong>Partial failure never fails the batch</strong>
            </span>
            <span>
              <i>04</i>
              <strong>Progress survives refresh and navigation</strong>
            </span>
          </div>
        </div>
      </section>
      <section className="section shell">
        <div className="source-heading">
          <div>
            <p className="kicker">Authoritative basis</p>
            <h2>Official sources, attached to findings</h2>
            <p>
              Rules are reviewed against current eCFR text and TTB guidance. The
              stored ruleset version keeps completed decisions reproducible.
            </p>
          </div>
          <span>Last reviewed July 31, 2026</span>
        </div>
        <div className="source-list">
          {sources.map((source) => (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              key={source.url}
            >
              <span>
                <strong>{source.label}</strong>
                <small>{source.detail}</small>
              </span>
              <ExternalIcon size={18} />
            </a>
          ))}
        </div>
        <div className="legal-note">
          <ShieldIcon size={22} />
          <div>
            <strong>Independent prototype—not a legal determination</strong>
            <p>
              ProofCheck does not issue a Certificate of Label Approval,
              represent TTB, or replace review by qualified personnel. TTB’s own
              checklists state that they are not comprehensive.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
