# Roadmap

Ordered by what removes the most uncertainty per unit of work.

1. **SAS verification, tested between two real devices.** The flow exists; what is missing
   is a second client on hand to compare the emoji with.
2. **Sessions.** Listing and signing out other sessions works; a user can still not rename a
   session or see where it came from.
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
