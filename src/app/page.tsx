import Link from "next/link";
import {
  Building2,
  Users,
  CreditCard,
  FileText,
  Wrench,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  BarChart3,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";

function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            Rentus Homes
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="#features"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Features
          </Link>
          <Link
            href="#how-it-works"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            How It Works
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary/70">
            Property Management Software
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Manage your rentals
            <span className="block text-primary/80">with confidence</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Rentus Homes gives landlords and property managers one place to
            handle tenants, leases, payments, maintenance, and communications
            — so you can spend less time on admin and more time growing your
            portfolio.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-8 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Get Started Free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="#features"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border bg-background px-8 text-base font-medium transition-colors hover:bg-accent"
            >
              See Features
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Building2,
    title: "Property & Unit Management",
    description:
      "Organize your entire portfolio. Track vacancies, manage units, and keep property details up to date in one dashboard.",
  },
  {
    icon: Users,
    title: "Tenant Management",
    description:
      "Store tenant information, track move-in/move-out dates, manage occupancy, and keep a full history for every resident.",
  },
  {
    icon: FileText,
    title: "Lease Generation & E-Signing",
    description:
      "Create leases from templates, generate PDFs, and send for electronic signature — no printing or scanning required.",
  },
  {
    icon: CreditCard,
    title: "Payment Tracking & Ledger",
    description:
      "Record payments, automatically update tenant balances, and generate detailed financial ledgers and export reports.",
  },
  {
    icon: MessageSquare,
    title: "Tenant Communications",
    description:
      "Send SMS, email, and Facebook messages from one inbox. Get AI-drafted replies and automatic message classification.",
  },
  {
    icon: Wrench,
    title: "Maintenance & Tasks",
    description:
      "Track maintenance requests, manage air filter schedules, assign cleaning duties, and keep a task board for your team.",
  },
  {
    icon: ShieldCheck,
    title: "Enforcement & Legal",
    description:
      "Automate late notices, track enforcement timelines, generate court-ready document packets, and manage deposit dispositions.",
  },
  {
    icon: BarChart3,
    title: "Utility Billing",
    description:
      "Parse bills from major providers, calculate fair tenant splits, allocate charges to ledgers, and send billing notifications.",
  },
];

function Features() {
  return (
    <section id="features" className="border-t bg-muted/30 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary/70">
            Features
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to manage rentals
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From collecting rent to filing court documents, Rentus Homes covers
            the full landlord workflow.
          </p>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border bg-background p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="size-5 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    step: "1",
    title: "Create your organization",
    description:
      "Sign up with Google and set up your property management workspace in seconds.",
  },
  {
    step: "2",
    title: "Add your properties",
    description:
      "Enter your properties, units, and current tenants. Import lease details and payment history.",
  },
  {
    step: "3",
    title: "Manage everything in one place",
    description:
      "Handle day-to-day operations from a single dashboard — payments, messages, maintenance, and more.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary/70">
            How It Works
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Up and running in minutes
          </h2>
        </div>
        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {steps.map((item) => (
            <div key={item.step} className="text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                {item.step}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const benefits = [
  "Multi-property portfolio support",
  "Team collaboration with role-based access",
  "Automated late fee tracking & enforcement",
  "AI-powered message drafting",
  "Electronic lease signing",
  "Utility bill parsing & tenant allocation",
  "Move-in / move-out workflows",
  "Court-ready document generation",
];

function CTA() {
  return (
    <section className="border-t bg-muted/30 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to simplify your rental operations?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join property managers who use Rentus Homes to save hours every week.
          </p>
          <div className="mt-8 grid gap-3 text-left sm:mx-auto sm:max-w-lg sm:grid-cols-2">
            {benefits.map((benefit) => (
              <div
                key={benefit}
                className="flex items-start gap-2 text-sm"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-8 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Get Started Free
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-muted/20 py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Building2 className="size-4" />
              </div>
              <span className="text-lg font-bold">Rentus Homes</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Property management software for landlords and property managers.
              Manage tenants, leases, payments, maintenance, and communications
              in one place.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Contact</h3>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>3323 Ridge Rd, Durham, NC 27705</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="size-4 shrink-0" />
                <a
                  href="mailto:info@rentus.homes"
                  className="transition-colors hover:text-foreground"
                >
                  info@rentus.homes
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0" />
                <a
                  href="tel:+12132932712"
                  className="transition-colors hover:text-foreground"
                >
                  (213) 293-2712
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="#features" className="transition-colors hover:text-foreground">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="transition-colors hover:text-foreground">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Sign In
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy" className="transition-colors hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="transition-colors hover:text-foreground">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t pt-6 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Rentus Homes. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
