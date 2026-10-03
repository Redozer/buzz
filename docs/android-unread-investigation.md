# Android unread indicator investigation

Base: `Redozer/buzz` main at `ec7ea38f62ea917f15e85a678bc94f3bbee5bb64`.
The base contains `c213d90d5c450e2e579505da4a4145f528ecbcf2`.

## Confirmed rendering gap

`mobile/lib/features/channels/channels_page/channel_tile.dart` receives
`isUnread`, but before this change it only changes label weight and foreground
opacity. There is no channel unread-dot widget in its row, for Android or iOS.
Existing channel-page tests assert bold text, not a visible unread indicator.
Even a correctly populated unread store cannot render a dot through that code.

The patch adds an 8dp primary-color circle and an `Unread` semantics label to
the existing channel row when `isUnread` is true. It adds no subscriptions,
queries, state stores, notification rules or timers. Streams and DMs share this
row; the change applies to both mobile platforms. It does not introduce numeric
channel badges or change the independent Inbox-tab/app-icon badges.

This confirms a missing visual affordance. It does not establish that the
affected installed Android build receives/classifies unread events correctly.
No device, APK revision, user read markers or relay capture was available.

## Mobile path

| Stage | Production seam | Behavior |
| --- | --- | --- |
| Membership | `ChannelsNotifier._fetch` in `channels_provider.dart` | Resolves kind 39002 membership and kind 39000 channel metadata. |
| Live coverage | `_syncLiveSubscriptions` in `channels_provider_lifecycle.dart` | Installs channel-event subscriptions in chunks of at most 128 channel IDs, `#h`, `limit: 0`; then starts detached unread catch-up. |
| Catch-up query | `_catchUpUnreadEvents` in `channels_provider.dart` | Active member/nonarchived channels; message kinds; one `#h` filter per channel; `since = readAt + 1` (0 if missing), limit 1000. |
| Transport | `_fetchChannelHistoryBatch` → `RelaySessionNotifier.queryRelay` | Signed HTTP `POST /query` first; on error uses WebSocket `fetchHistory` in groups of four. This is not the desktop native query path. |
| WebSocket completion | `_handleEose` / `_handleClosed` in `relay_session.dart` | EOSE completes history future with buffered events. CLOSED completes history future with error, activating quota cooldown where applicable. Mobile finite history does not perform the native desktop retry added by c213d90. |
| Classification | `_catchUpUnreadEvents` / `_handleLiveEvent`, `should_notify_for_event.dart` | Reject self/nonmessage events; evaluate mention/broadcast/mute/thread-interest rules. Catch-up checks relay/identity/refresh/subscription ownership before writing. |
| Store | `_recordUnreadEvent` in `channel_directory.dart` | Stores deduplicated bounded `ObservedUnreadEvent` and advances `latestObservedByChannel`. |
| Invalidation | `channels_provider.dart` | Catch-up republishes a fresh channel list when it recorded events; live handling publishes a copied list. `ChannelsPage` watches `channelsProvider`. |
| Projection | `_computeUnreadChannelState` in `channels_page.dart` | Waits for read-state readiness; applies locally forced unread and channel/thread/message timestamps. |
| First-use baseline | `_SliverChannelsList` in `channels_page/body.dart` | Seeds channels without a marker to `lastMessageAt`; gates initial highlights while seeding. This is existing behavior, preserved by the patch. |
| Row | `channels_page/sections.dart` → `_ChannelTile` | Passes `unreadChannelIds.contains(channel.id)`. Before patch, only text styling; after patch, also a visible dot. |

`unread_badge_provider.dart` independently derives aggregate general/high-priority
counts from the same observed stores. It does not render channel-row dots.

## Desktop comparison

Desktop `useUnreadChannels.ts` calls `unreadCatchUp` through the Tauri bridge.
`desktop/src-tauri/src/unread_catch_up.rs` fetches and classifies channel results;
`native_relay_client.rs` owns finite-query quota recovery. The renderer checks
scope, merges observed events/membership and bumps versions before projecting
unread sets/counts. Native EOSE alone proves none of those later steps.

Desktop `SidebarSection.tsx` explicitly renders `UnreadDotBadge` (8px, primary
color, screen-reader text) from `hasThreadUnread`. That predicate uses the
sidebar thread projection when available, otherwise `hasUnread`, and excludes
DM rows. Mobile currently has a broader row `isUnread` predicate and uses bold
labels for both streams and DMs. This patch exposes that existing mobile
predicate; it does not copy desktop's thread-only dot policy or add a new
classification policy under the guise of a rendering fix.

The c213d90 diff contains desktop source/tests only. Its 156-query EOSE evidence
cannot certify the independent Flutter HTTP/WS pipeline or Android paint.
The latest mobile-channel commits at this base concern thread navigation,
refresh preservation, menu responsiveness, cache verification and performance;
the inspected row still contains no unread-dot renderer.

## Regression boundaries

The production `ChannelsPage` widget tests cover Android stream dots, visible
8x8 geometry, primary color, circular shape and merged actionable accessibility
semantics. Advancing the channel marker removes the dot. Thread markers remove
thread-derived dots; dark-theme DM rows show a dot while read stream rows remain
clear. Existing first-load seeding remains clear. These tests override channel
data/read-state providers: they exercise the real projection and row, not a
live relay, APK or physical Android device.

## If unread is still absent on the device

Check these boundaries in order, scoped to one member channel with a persisted
read marker older than a known event from another author. Avoid first-use seed
behavior when diagnosing delivery.

1. Record installed APK source SHA and selected relay/identity; ensure it
   includes this renderer. Check whether the row becomes bold or the long-press
   action says `Mark Read`: those use the existing unread projection.
2. Inspect the HTTP `/query` unread response and filters, not desktop's native
   EOSE counters. If HTTP fails, inspect each mobile WS history result/CLOSED.
   `_fetchChannelHistoryBatch` currently converts individual fallback errors to
   empty lists; an all-failed fallback can appear as an empty catch-up. This is
   a separate confirmed error-handling weakness, not proof of this incident's
   cause. Do not broaden this rendering patch into transport retry changes.
3. Verify `event.channelId`, author, kind, `createdAt`, notification eligibility
   and the current catch-up fence. Record only IDs/timestamps, not message text
   or private keys. A scoped response may legitimately be discarded after a
   community/identity/refresh change.
4. Inspect the observed map entry and latest timestamp, then channel/thread/
   message effective read markers, `isReady`, forced-unread state and initial
   seeding. A read timestamp covering the event correctly suppresses the dot.
5. If the store has an eligible event but the row remains read, verify the
   fresh channel-list state emission and `_computeUnreadChannelState` output.
   If `isUnread` is true with this renderer and the dot is not visible, capture
   the actual row/theme/viewport on Android; widget tests cannot certify that
   device's build or paint.
