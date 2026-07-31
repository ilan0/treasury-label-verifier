import Link from "next/link";
import Image from "next/image";
import {
  ArrowIcon,
  BatchIcon,
  CheckIcon,
  ClockIcon,
  ReviewIcon,
  SparkIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { DemoLauncher } from "@/components/dashboard/demo-launcher";

const samples = [
  {
    id: "compliant-bourbon",
    title: "Compliant bourbon",
    type: "Distilled spirits",
    image: "/demo/old-tom-bourbon.svg",
    description:
      "Scaled artwork with matching identity, proof, warning, and application data.",
    outcome: "pass" as const,
  },
  {
    id: "stones-throw",
    title: "Formatting, not a mismatch",
    type: "Distilled spirits",
    image: "/demo/stones-throw.svg",
    description:
      "Shows why punctuation and case should not create unnecessary work.",
    outcome: "pass" as const,
  },
  {
    id: "warning-format",
    title: "Warning statement issue",
    type: "Wine",
    image: "/demo/warning-error.svg",
    description:
      "Finds a title-case heading that requires correction under 27 CFR Part 16.",
    outcome: "fail" as const,
  },
  {
    id: "imported-wine",
    title: "Imported origin discrepancy",
    type: "Wine · Import",
    image: "/demo/imported-wine.svg",
    description:
      "Compares country-of-origin evidence with the submitted application.",
    outcome: "fail" as const,
  },
  {
    id: "malt-conditional",
    title: "Conditional malt beverage",
    type: "Malt beverage",
    image: "/demo/harbor-lager.svg",
    description:
      "Demonstrates beverage-specific alcohol-content rules and citations.",
    outcome: "pass" as const,
  },
  {
    id: "low-quality",
    title: "Low-quality photograph",
    type: "Distilled spirits",
    image: "/demo/glare-label.svg",
    description:
      "Routes glare-obscured evidence to a person instead of inventing a pass.",
    outcome: "review" as const,
  },
];

export default function Home() {
  return (
    <div>
      <section className="hero shell">
        <div className="eyebrow">
          <SparkIcon size={17} /> AI-assisted alcohol label pre-screen
        </div>
        <div className="hero-grid">
          <div>
            <h1>Review label applications with evidence, not guesswork.</h1>
            <p className="hero-copy">
              ProofCheck reads label artwork, compares it with application data,
              and applies beverage-specific TTB checks—then sends uncertainty to
              a person.
            </p>
            <div className="hero-actions">
              <DemoLauncher
                scenario="compliant-bourbon"
                label="Run a complete example"
              />
              <Link
                className="button button-secondary button-large"
                href="/submit"
              >
                <UploadIcon size={19} /> Verify your own label
              </Link>
            </div>
            <p className="hero-note">
              <ClockIcon size={16} /> No account or files required. The example
              usually completes in seconds.
            </p>
          </div>
          <aside
            className="hero-proof"
            aria-label="Example verification summary"
          >
            <div className="proof-header">
              <div>
                <span>Example result</span>
                <strong>OLD TOM DISTILLERY</strong>
              </div>
              <span className="live-dot">Live AI workflow</span>
            </div>
            <div className="proof-score">
              <div className="score-ring">
                <strong>96</strong>
                <span>confidence</span>
              </div>
              <div>
                <span className="status-badge status-success">
                  <CheckIcon size={15} />
                  Pre-check passed
                </span>
                <p>7 automated checks completed</p>
              </div>
            </div>
            <div className="proof-checks">
              {[
                "Brand name",
                "Class / type",
                "Alcohol content",
                "Health warning",
              ].map((label) => (
                <div key={label}>
                  <CheckIcon size={16} />
                  <span>{label}</span>
                  <strong>Match</strong>
                </div>
              ))}
            </div>
            <p className="proof-disclaimer">
              Physical type size is evaluated only when artwork scale is
              available.
            </p>
          </aside>
        </div>
      </section>

      <section className="trust-strip">
        <div className="shell trust-grid">
          <div>
            <strong>Deterministic rules</strong>
            <span>AI extracts; code evaluates</span>
          </div>
          <div>
            <strong>Official citations</strong>
            <span>Every finding links to its source</span>
          </div>
          <div>
            <strong>Human in the loop</strong>
            <span>Uncertainty is never hidden</span>
          </div>
          <div>
            <strong>Private by default</strong>
            <span>Custom artwork automatically expires</span>
          </div>
        </div>
      </section>

      <section className="section shell" aria-labelledby="examples-heading">
        <div className="section-heading">
          <div>
            <p className="kicker">Try it now</p>
            <h2 id="examples-heading">Purpose-built user examples</h2>
            <p>
              Each scenario highlights a real product decision or compliance
              edge case.
            </p>
          </div>
          <DemoLauncher
            scenario="batch-250"
            label="Run 250-item batch"
            appearance="secondary"
            icon="batch"
          />
        </div>
        <div className="sample-grid">
          {samples.map((sample) => (
            <article className="sample-card" key={sample.id}>
              <div className="sample-art">
                <Image
                  src={sample.image}
                  alt={`${sample.title} sample label artwork`}
                  width={700}
                  height={900}
                />
              </div>
              <div className="sample-content">
                <div className="sample-meta">
                  <span>{sample.type}</span>
                  <span className={`outcome-dot dot-${sample.outcome}`}>
                    {sample.outcome === "pass"
                      ? "Expected pass"
                      : sample.outcome === "fail"
                        ? "Expected issue"
                        : "Review case"}
                  </span>
                </div>
                <h3>{sample.title}</h3>
                <p>{sample.description}</p>
                <DemoLauncher
                  scenario={sample.id}
                  label="Run example"
                  appearance="text"
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-tinted">
        <div className="shell workflow-grid">
          <div>
            <p className="kicker">Clear by design</p>
            <h2>A review flow that explains itself.</h2>
            <p>
              Built for experienced agents and first-time users alike. No hidden
              menus, black-box scores, or ambiguous outcomes.
            </p>
            <Link className="text-link" href="/methodology">
              Explore the methodology <ArrowIcon size={17} />
            </Link>
          </div>
          <ol className="workflow-steps">
            <li>
              <span>
                <UploadIcon />
              </span>
              <div>
                <strong>1. Add the application and label set</strong>
                <p>
                  Enter fields manually, upload an application document, or map
                  a batch CSV.
                </p>
              </div>
            </li>
            <li>
              <span>
                <SparkIcon />
              </span>
              <div>
                <strong>2. Extract and verify asynchronously</strong>
                <p>
                  Artwork is read once, then compared through transparent TTB
                  rule logic.
                </p>
              </div>
            </li>
            <li>
              <span>
                <ReviewIcon />
              </span>
              <div>
                <strong>3. Resolve only what needs judgment</strong>
                <p>
                  Review evidence and citations side-by-side, then document the
                  decision.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="section shell batch-callout">
        <div className="batch-visual">
          <BatchIcon size={30} />
          <div className="batch-bars">
            {[88, 74, 96, 62, 82].map((width, i) => (
              <span key={i}>
                <i style={{ width: `${width}%` }} />
              </span>
            ))}
          </div>
          <div className="batch-total">
            <strong>250</strong>
            <span>applications queued independently</span>
          </div>
        </div>
        <div>
          <p className="kicker">Peak-season ready</p>
          <h2>See asynchronous batch review in action.</h2>
          <p>
            Launch a prebuilt 250-application benchmark. Watch independent
            status changes, filter findings, open an item, and export results
            without spending 250 model calls.
          </p>
          <div className="hero-actions">
            <DemoLauncher
              scenario="batch-250"
              label="Launch benchmark batch"
              icon="batch"
            />
            <a
              className="button button-secondary"
              href="/sample-batch.csv"
              download
            >
              Download CSV template
            </a>
          </div>
          <p className="fine-print">
            The benchmark replays disclosed, validated extractions through the
            real queue and deterministic rule engine.
          </p>
        </div>
      </section>
    </div>
  );
}
