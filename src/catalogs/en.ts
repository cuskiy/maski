export const en = {
  "app.name": "maski",
  "app.tagline": "A fast, local-first Matrix client",
  "app.description": "A Matrix client that keeps your messages on your device",
  "boot.starting": "Starting",

  "lang.switch": "Language",
  "lang.en": "English",
  "lang.zh-CN": "简体中文",

  "noscript.router": "This page needs JavaScript to open the client.",
  "noscript.chat": "Messages need JavaScript. The frame you see is the client.",
  "noscript.surface": "This panel needs JavaScript.",
  "js.required": "JavaScript is required",

  "nav.search": "Search",
  "nav.newMessage": "New message",
  "nav.invite": "Invites",
  "nav.join": "Join room",
  "nav.create": "Create room",
  "nav.settings": "Settings",
  "nav.label": "Client actions",
  "nav.roomsLabel": "Rooms",

  "sections.favorites": "Favorites",
  "sections.rooms": "Rooms",
  "sections.direct": "Direct messages",
  "sections.channels": "Channels",
  "sections.empty": "Join or create a room",

  "surface.settings": "Settings",
  "surface.search": "Search",
  "surface.newMessage": "New message",
  "surface.invite": "Invites",
  "surface.join": "Join a room",
  "surface.create": "Create a room",
  "surface.attach": "Attach",
  "surface.sticker": "Stickers",
  "surface.emoji": "Emoji",
  "surface.close": "Close",

  "chat.title": "Chat",
  "chat.notSignedIn": "Not signed in",
  "chat.keyMissing": "The encryption keys are not set up",
  "chat.noRoom": "No room is open",
  "chat.loadOlder": "Load older messages",
  "chat.back": "Back to the room list",
  "room.topic": "Topic",
  "room.members": "{count} members",
  "room.membersOne": "1 member",

  "composer.label": "Message",
  "composer.placeholder": "Write a message",
  "composer.send": "Send",
  "composer.attach": "Attach files",
  "composer.sticker": "Stickers",
  "composer.emoji": "Emoji",
  "composer.tray": "Files to send",

  "router.opening": "Opening maski",
  "router.open": "Open the client",
} as const;

export type EnCatalog = typeof en;
