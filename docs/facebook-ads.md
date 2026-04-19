# Facebook Ads + Messenger Chatbot

This app supports two clearly-separated kinds of Facebook ads. Both are created
from the Publish dialog on a listing (`/dashboard/listings/[id]` → Publish).

## The two ad types

### 1. Messenger chatbot ad (recommended)

Tapping the ad opens a Facebook Messenger thread with your Page. The AI chatbot
in `src/lib/facebook-conversation.ts` replies within seconds, answers questions
using the listing data, collects name / phone / email, proposes Google Calendar
availability, and books a showing.

- Meta objective: `OUTCOME_ENGAGEMENT`, optimization goal `CONVERSATIONS`
- Ad set `destination_type: MESSENGER`
- Creative CTA: `MESSAGE_PAGE` (app_destination `MESSENGER`)
- Each ad embeds a `ref=listing_<id>` so inbound referrals attribute to the right listing
- View and manage threads at `/dashboard/conversations`
- When you reply manually from the Page inbox (or from the Conversations UI), the
  bot automatically pauses for that thread (two-way takeover — flip it back
  anytime)

### 2. Marketplace link ad

Tapping the ad opens a Facebook Marketplace item URL you supply. Replies happen
through Marketplace / Messenger manually. No chatbot involvement.

- Meta objective: `OUTCOME_AWARENESS`, optimization goal `REACH`
- Creative CTA: `LEARN_MORE` linking to `marketplaceUrl`
- **You must post the Marketplace item manually from a personal profile first**,
  then paste the URL into the Publish dialog.

## Why you post Marketplace items manually

On **Jan 30, 2025**, Meta stopped allowing business Pages to post rental
listings organically to Facebook Marketplace. Rentals on Marketplace must now
come from either a personal profile (manual) or a paid ad. Our Page-based
integration cannot post Marketplace items on your behalf for rentals; the
Marketplace Partner Item API exists but is a gated partner program.

The current flow:

1. Create the listing in the app.
2. Click Publish → select FACEBOOK. This posts a Page post (used as the visual basis for ads).
3. For the Marketplace URL, post the listing to Marketplace yourself from a personal profile.
4. Paste that URL back into the Publish dialog when creating a Marketplace-link ad.

## The 24-hour Messenger window

Meta's Messenger Platform lets the Page reply freely **within 24 hours of the
prospect's last message**. After that, proactive outreach requires a message
tag or the paid Marketing Messages API. In practice this is fine — rental
inquiries move fast — but the chatbot is prompted to push for a phone number
or email so you can follow up outside Messenger if the thread goes cold.

## Environment variables

### Facebook / Meta

| Variable | Required | Purpose |
|---|---|---|
| `FACEBOOK_PAGE_ACCESS_TOKEN` | yes | Page token with `pages_messaging`, `pages_manage_posts`, `ads_management` scopes |
| `FACEBOOK_PAGE_ID` | yes | Your Page's numeric ID |
| `FACEBOOK_APP_SECRET` | yes (prod) | Used for HMAC-SHA256 webhook signature validation |
| `FACEBOOK_VERIFY_TOKEN` | yes | Any random string you also configure in the Meta webhook subscription |
| `FACEBOOK_AD_ACCOUNT_ID` | yes | `act_<numeric>` — your Ad Account ID |
| `FACEBOOK_DRY_RUN` | optional | Set to `true` to skip real Graph API calls (local/dev testing) |

### Google Calendar (for showing bookings)

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CALENDAR_CREDENTIALS` | yes (for scheduling) | Service account JSON credentials as a single-line JSON string |
| `GOOGLE_CALENDAR_ID` | yes (for scheduling) | Calendar ID, e.g. `abcd1234...@group.calendar.google.com` |

Setup:
1. Create a Google Cloud service account. Generate + download a JSON key.
2. Create (or pick) a Google Calendar. Open its Settings → "Share with specific people" → add the service account's email with "Make changes to events".
3. In Calendar Settings → "Integrate calendar", copy the Calendar ID into `GOOGLE_CALENDAR_ID`.
4. Paste the service account JSON (contents, stringified) into `GOOGLE_CALENDAR_CREDENTIALS`.

All showings created by the bot go to this one calendar.

## Meta webhook subscription

In your Meta app's webhook subscription for the Page, enable:

- `messages` — inbound prospect messages
- `messaging_postbacks` — CTA-button taps
- **`messaging_referrals`** — **required** for click-to-Messenger ad attribution.
  Without this, a prospect's first message from a Messenger ad will not carry
  the ad ID or `ref`, and the chatbot has to guess which listing they came from.

Page-level permissions the token needs:

- `pages_messaging` — Send API
- `pages_manage_posts` — create listing Page posts
- `ads_management` + `pages_manage_ads` — Marketing API campaigns/ad sets/ads

## Human takeover behaviour

Conversations have a `humanTakeover` boolean. It flips in three ways:

1. **You reply from the Conversations UI** (`/dashboard/conversations/[id]`) →
   `humanTakeover` set to `true` automatically, bot goes silent for that thread.
2. **You reply from Meta Business Suite / Pages Manager** → Meta delivers an
   `is_echo` event to our webhook → same thing, `humanTakeover = true`.
3. **The prospect asks for a human** ("talk to a real person", "I want to
   speak with the manager", etc.) → the AI returns `requestsHuman=true`, the
   bot sends one handoff message, and `humanTakeover = true`.

To give control back, toggle "Resume bot" from the Conversations UI. The bot
resumes on the prospect's next inbound message, with full context of what the
human said (it reads the most recent 20 messages each turn).

## HOUSING compliance

Both ad types are created with `special_ad_categories: ["HOUSING"]`. This
enforces:

- Age 18-65 (no granular age targeting)
- Gender: all
- Location: city + 15-mile radius minimum
- No interest/behavior targeting
- Facebook-only placements (feed + Marketplace) — no Instagram

This is mandatory for real-estate ads; bypassing it will get ads rejected or the
ad account flagged.
