import Link from "next/link";
import { Building2 } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Rentus Homes",
  description: "Privacy Policy for Rentus Homes property management software.",
};

export default function PrivacyPolicy() {
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
            Privacy Policy
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>

          <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground [&_h2]:mb-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1">
            <section>
              <h2>1. Introduction</h2>
              <p>
                Rentus Homes (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates a property management
                platform located at rentus.homes (the &quot;Service&quot;). This Privacy Policy
                describes how we collect, use, disclose, and protect your personal
                information when you use our Service.
              </p>
              <p className="mt-3">
                By using the Service, you agree to the collection and use of
                information in accordance with this policy. If you do not agree with
                this policy, please do not use the Service.
              </p>
            </section>

            <section>
              <h2>2. Information We Collect</h2>
              <p>We collect the following types of information:</p>
              <ul className="mt-3">
                <li>
                  <strong className="text-foreground">Account Information:</strong> Name, email
                  address, and authentication credentials when you create an account.
                </li>
                <li>
                  <strong className="text-foreground">Property & Tenant Data:</strong> Property
                  addresses, unit details, tenant names, contact information, lease
                  terms, payment records, and maintenance requests that you enter into
                  the Service.
                </li>
                <li>
                  <strong className="text-foreground">Communication Data:</strong> SMS messages,
                  emails, and other communications sent or received through the
                  Service, including phone numbers and message content.
                </li>
                <li>
                  <strong className="text-foreground">Payment Information:</strong> Payment amounts,
                  dates, and ledger entries recorded in the Service.
                </li>
                <li>
                  <strong className="text-foreground">Usage Data:</strong> Log data, device
                  information, browser type, pages visited, and other analytics
                  related to your use of the Service.
                </li>
              </ul>
            </section>

            <section>
              <h2>3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="mt-3">
                <li>Provide, maintain, and improve the Service</li>
                <li>Process and manage property, tenant, and lease data</li>
                <li>
                  Send SMS messages, emails, and other communications on your behalf
                  to tenants and other parties
                </li>
                <li>Generate documents such as leases, notices, and reports</li>
                <li>Provide customer support and respond to inquiries</li>
                <li>Ensure the security and integrity of the Service</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2>4. SMS/Text Messaging</h2>
              <p>
                Our Service enables property managers and landlords to send SMS/text
                messages to tenants for property management purposes. By signing a
                lease through Rentus Homes, tenants consent to receive text messages
                at the phone number provided during lease setup.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">What You Consent To:</strong> By
                signing your lease through Rentus Homes, you agree to receive text
                messages from Rentus Homes related to your rental, including: rent
                payment reminders, utility billing notifications, lease signing
                requests and updates, maintenance updates, property notices, and
                move-in/move-out communications. All messages are transactional — no
                marketing messages are sent.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">Opt-Out:</strong> You may opt out of
                text messages at any time by replying STOP to any message. Once you
                opt out, no further text messages will be sent to your number unless
                you re-subscribe. Opting out of text messages does not affect other
                communications related to your lease.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">Help:</strong> Reply HELP to any
                message for assistance. You may also contact us at{" "}
                <a href="mailto:info@rentus.homes" className="text-primary underline">info@rentus.homes</a>{" "}
                or{" "}
                <a href="tel:+12132932712" className="text-primary underline">(213) 293-2712</a>.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">Message Frequency:</strong> Message
                frequency varies based on property management activities and
                communications initiated by the property manager.
              </p>
              <p className="mt-3">
                <strong className="text-foreground">Message & Data Rates:</strong> Standard
                message and data rates may apply. Carriers are not liable for delayed
                or undelivered messages.
              </p>
              <p className="mt-3">
                We do not sell, rent, or share phone numbers or SMS content with third
                parties for marketing purposes.
              </p>
            </section>

            <section>
              <h2>5. Data Sharing & Disclosure</h2>
              <p>
                We do not sell your personal information. We may share information in
                the following circumstances:
              </p>
              <ul className="mt-3">
                <li>
                  <strong className="text-foreground">Service Providers:</strong> We use
                  third-party services (such as Twilio for SMS, cloud hosting
                  providers, and authentication services) that process data on our
                  behalf to operate the Service.
                </li>
                <li>
                  <strong className="text-foreground">Legal Requirements:</strong> We may
                  disclose information if required by law, legal process, or
                  government request.
                </li>
                <li>
                  <strong className="text-foreground">Business Transfers:</strong> In the event
                  of a merger, acquisition, or sale of assets, your information may be
                  transferred as part of that transaction.
                </li>
                <li>
                  <strong className="text-foreground">With Your Consent:</strong> We may share
                  information with your explicit consent.
                </li>
              </ul>
            </section>

            <section>
              <h2>6. Data Security</h2>
              <p>
                We implement reasonable technical and organizational security measures
                to protect your information against unauthorized access, alteration,
                disclosure, or destruction. However, no method of transmission over
                the Internet or electronic storage is 100% secure, and we cannot
                guarantee absolute security.
              </p>
            </section>

            <section>
              <h2>7. Data Retention</h2>
              <p>
                We retain your information for as long as your account is active or as
                needed to provide the Service. We may also retain information as
                required by law, to resolve disputes, and to enforce our agreements.
              </p>
            </section>

            <section>
              <h2>8. Your Rights</h2>
              <p>Depending on your jurisdiction, you may have the right to:</p>
              <ul className="mt-3">
                <li>Access the personal information we hold about you</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your information</li>
                <li>Object to or restrict certain processing of your information</li>
                <li>Request a copy of your information in a portable format</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, please contact us at{" "}
                <a href="mailto:info@rentus.homes" className="text-primary underline">
                  info@rentus.homes
                </a>.
              </p>
            </section>

            <section>
              <h2>9. Cookies & Tracking</h2>
              <p>
                We use cookies and similar technologies to maintain your session,
                remember your preferences, and understand how you use the Service. You
                can control cookie settings through your browser preferences.
              </p>
            </section>

            <section>
              <h2>10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify
                you of material changes by posting the updated policy on this page
                with a revised &quot;Last updated&quot; date. Your continued use of the Service
                after changes are posted constitutes acceptance of the revised policy.
              </p>
            </section>

            <section>
              <h2>11. Contact Us</h2>
              <p>
                If you have any questions or concerns about this Privacy Policy,
                please contact us:
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
