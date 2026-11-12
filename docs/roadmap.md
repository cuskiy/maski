# Roadmap

Ordered by what removes the most uncertainty per unit of work.

1. **Device verification by SAS.** The gate and the settings security page name it; two
   devices comparing emoji is the missing half of a trustworthy key story.
2. **Sessions in settings.** List, verify and sign out other devices through the SDK's
   device API, with UIA for the bulk sign-out.
3. **Notifications.** The in-page path exists; a service worker and a push gateway are
   needed for a closed page, which needs a server component and an explicit decision.
4. **Media coverage.** Video posters, audio duration, upload progress and cancellation.
5. **Room management.** Avatar upload from room settings, kick and ban with the right
   power level, enabling encryption on an existing room.
6. **Pack management.** Add a room pack to all rooms, remove a global pack, and see why a
   pack is unavailable.
7. **SSO.** The login page documents flows; the redirect dance needs a real identity
   provider to verify.
8. **Offline start.** A cold load without a network already renders from the projection;
   what is missing is a service worker to serve the shell itself offline.
