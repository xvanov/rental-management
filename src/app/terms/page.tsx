import Link from "next/link";
import { Building2 } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Rentus Homes",
  description: "Terms of Service for Rentus Homes property management software.",
};

export default function TermsOfService() {
  return (
    <div className="flex min-h-screen flex-col">
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
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>

          <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground [&_h2]:mb-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1">
            <section>
              <h2>1. Acceptance of Terms</h2>
              <p>
                By accessing or using the Rentus Homes platform located at
                rentus.homes (the &quot;Service&quot;), operated by Rentus Homes
                (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of
                Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not
                use the Service.
              </p>
            </section>

            <section>
              <h2>2. Description of Service</h2>
              <p>
                Rentus Homes is a property management software platform that provides
                landlords and property managers with tools to manage rental
                properties, including but not limited to:
              </p>
              <ul className="mt-3">
                <li>Property and unit management</li>
                <li>Tenant information management</li>
                <li>Lease generation, tracking, and electronic signing</li>
                <li>Payment recording and financial ledger management</li>
                <li>SMS, email, and other tenant communications</li>
                <li>Maintenance request and task management</li>
                <li>Utility billing and tenant allocation</li>
                <li>Legal notice generation and enforcement tracking</li>
                <li>Move-in and move-out workflow management</li>
              </ul>
            </section>

            <section>
              <h2>3. Account Registration</h2>
              <p>
                To use the Service, you must create an account by signing in with a
                supported authentication provider. You are responsible for maintaining
                the security of your account credentials and for all activities that
                occur under your account. You agree to notify us immediately of any
                unauthorized use of your account.
              </p>
            </section>

            <section>
              <h2>4. Acceptable Use</h2>
              <p>You agree to use the Service only for lawful purposes. You may not:</p>
              <ul className="mt-3">
                <li>
                  Use the Service in violation of any applicable local, state,
                  national, or international law or regulation
                </li>
                <li>
                  Send unsolicited or unauthorized messages, spam, or bulk
                  communications through the Service
                </li>
                <li>
                  Use the Service to harass, threaten, or intimidate any person
                </li>
                <li>
                  Attempt to gain unauthorized access to the Service, other accounts,
                  or computer systems or networks connected to the Service
                </li>
                <li>
                  Interfere with or disrupt the Service or servers or networks
                  connected to the Service
                </li>
                <li>
                  Upload or transmit viruses, malware, or other harmful code
                </li>
                <li>
                  Use the Service to collect or store personal data about others
                  without their consent, in violation of applicable data protection
                  laws
                </li>
              </ul>
            </section>

            <section>
              <h2>5. SMS & Messaging Terms</h2>
              <p>
                The Service includes the ability to send SMS/text messages and other
                communications to tenants and other parties. By using these features,
                you agree to the following:
              </p>
              <ul className="mt-3">
                <li>
                  <strong className="text-foreground">Consent:</strong> You represent and
                  warrant that you have obtained proper consent from all recipients
                  before sending them messages through the Service, in compliance with
                  the Telephone Consumer Protection Act (TCPA) and all other
                  applicable laws.
                </li>
                <li>
                  <strong className="text-foreground">Content:</strong> You are solely
                  responsible for the content of all messages sent through the
                  Service. Messages must be related to legitimate property management
                  purposes.
                </li>
                <li>
                  <strong className="text-foreground">Opt-Out:</strong> You must honor all
                  opt-out requests promptly. Recipients may opt out of SMS messages at
                  any time by replying STOP.
                </li>
                <li>
                  <strong className="text-foreground">Prohibited Content:</strong> You may not
                  use the messaging features to send marketing messages, promotional
                  content unrelated to property management, or any content that
                  violates applicable laws.
                </li>
              </ul>
            </section>

            <section>
              <h2>6. Tenant SMS Consent & Opt-In</h2>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-4">
                <p className="text-foreground font-medium">
                  By signing a lease through Rentus Homes, tenants agree to receive
                  SMS/text messages from Rentus Homes at the phone number provided
                  during lease setup. These messages are transactional and related to
                  property management only — no marketing messages are sent.
                </p>
                <div>
                  <p className="text-foreground font-medium mb-2">Types of messages you may receive:</p>
                  <ul className="mt-1">
                    <li>Rent payment reminders and confirmations</li>
                    <li>Utility billing notifications</li>
                    <li>Lease signing requests and lease updates</li>
                    <li>Maintenance updates and scheduling</li>
                    <li>Property notices and important alerts</li>
                    <li>Move-in and move-out communications</li>
                  </ul>
                </div>
                <ul className="!ml-0 list-none space-y-2">
                  <li>
                    <strong className="text-foreground">Message Frequency:</strong> Message
                    frequency varies based on property management activity.
                  </li>
                  <li>
                    <strong className="text-foreground">Message & Data Rates:</strong> Standard
                    message and data rates may apply. Contact your carrier for details.
                  </li>
                  <li>
                    <strong className="text-foreground">Opt-Out:</strong> You may opt out of
                    receiving text messages at any time by replying <strong className="text-foreground">STOP</strong> to
                    any message. Once you opt out, you will not receive any further
                    text messages from Rentus Homes unless you re-subscribe.
                  </li>
                  <li>
                    <strong className="text-foreground">Help:</strong> Reply <strong className="text-foreground">HELP</strong> to
                    any message for assistance, or contact us at{" "}
                    <a href="mailto:info@rentus.homes" className="text-primary underline">info@rentus.homes</a>{" "}
                    or{" "}
                    <a href="tel:+12132932712" className="text-primary underline">(213) 293-2712</a>.
                  </li>
                </ul>
                <p>
                  We do not sell, rent, or share your phone number or message content
                  with third parties for marketing purposes. For more details, see
                  our{" "}
                  <a href="/privacy" className="text-primary underline">Privacy Policy</a>.
                </p>
              </div>
            </section>

            <section>
              <h2>7. User Data & Responsibilities</h2>
              <p>
                You retain ownership of all data you enter into the Service, including
                property information, tenant records, financial data, and
                communications. You are responsible for the accuracy and legality of
                all data you submit.
              </p>
              <p className="mt-3">
                You are responsible for complying with all applicable privacy laws
                regarding the personal information of your tenants and other
                individuals whose data you manage through the Service.
              </p>
            </section>

            <section>
              <h2>8. Service Availability</h2>
              <p>
                We strive to provide reliable access to the Service but do not
                guarantee uninterrupted availability. We may modify, suspend, or
                discontinue the Service (or any part of it) at any time, with or
                without notice. We are not liable for any modification, suspension, or
                discontinuation of the Service.
              </p>
            </section>

            <section>
              <h2>9. Intellectual Property</h2>
              <p>
                The Service and its original content (excluding data provided by
                users), features, and functionality are owned by Rentus Homes and are
                protected by copyright, trademark, and other intellectual property
                laws. You may not copy, modify, distribute, or create derivative works
                based on the Service without our express written permission.
              </p>
            </section>

            <section>
              <h2>10. Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by law, Rentus Homes shall not be
                liable for any indirect, incidental, special, consequential, or
                punitive damages, including but not limited to loss of profits, data,
                or business opportunities arising out of or related to your use of the
                Service.
              </p>
              <p className="mt-3">
                The Service is a management tool and does not provide legal, financial,
                or real estate advice. You are responsible for ensuring that your use
                of the Service complies with all applicable laws, including landlord-tenant
                regulations in your jurisdiction.
              </p>
            </section>

            <section>
              <h2>11. Disclaimer of Warranties</h2>
              <p>
                The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without
                warranties of any kind, either express or implied, including but not
                limited to implied warranties of merchantability, fitness for a
                particular purpose, and non-infringement.
              </p>
            </section>

            <section>
              <h2>12. Indemnification</h2>
              <p>
                You agree to indemnify and hold harmless Rentus Homes, its officers,
                directors, employees, and agents from any claims, liabilities,
                damages, losses, or expenses (including reasonable attorney&apos;s fees)
                arising out of or related to your use of the Service, your violation
                of these Terms, or your violation of any rights of a third party.
              </p>
            </section>

            <section>
              <h2>13. Termination</h2>
              <p>
                We may terminate or suspend your access to the Service immediately,
                without prior notice, for any reason, including if you breach these
                Terms. Upon termination, your right to use the Service will
                immediately cease. You may also terminate your account at any time by
                contacting us.
              </p>
            </section>

            <section>
              <h2>14. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the
                laws of the State of North Carolina, without regard to its conflict of
                law provisions.
              </p>
            </section>

            <section>
              <h2>15. Changes to These Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. We will notify
                you of material changes by posting the updated Terms on this page with
                a revised &quot;Last updated&quot; date. Your continued use of the Service after
                changes are posted constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2>16. Contact Us</h2>
              <p>
                If you have any questions about these Terms, please contact us:
              </p>
              <ul className="mt-3 list-none !ml-0">
                <li><strong className="text-foreground">Rentus Homes</strong></li>
                <li>3323 Ridge Rd, Durham, NC 27705</li>
                <li>
                  Email:{" "}
                  <a href="mailto:info@rentus.homes" className="text-primary underline">
                    info@rentus.homes
                  </a>
                </li>
                <li>
                  Phone:{" "}
                  <a href="tel:+12132932712" className="text-primary underline">
                    (213) 293-2712
                  </a>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground sm:px-6">
          &copy; {new Date().getFullYear()} Rentus Homes. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
