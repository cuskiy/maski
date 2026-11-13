export const zhCN = {
  "app.name": "maski",
  "app.tagline": "一个快速、以本地优先的 Matrix 客户端",
  "app.description": "把你的消息留在自己设备上的 Matrix 客户端",
  "boot.starting": "正在启动",

  "lang.switch": "语言",
  "lang.en": "English",
  "lang.zh-CN": "简体中文",

  "noscript.router": "这个页面需要 JavaScript 才能打开客户端。",
  "noscript.chat": "消息需要 JavaScript。你看到的就是客户端的框架。",
  "noscript.surface": "这个面板需要 JavaScript。",
  "js.required": "需要启用 JavaScript",

  "nav.search": "搜索",
  "nav.newMessage": "新消息",
  "nav.invite": "邀请",
  "nav.join": "加入房间",
  "nav.create": "创建房间",
  "nav.settings": "设置",
  "nav.label": "客户端操作",
  "nav.roomsLabel": "房间",

  "sections.favorites": "收藏",
  "sections.rooms": "房间",
  "sections.direct": "私聊",
  "sections.channels": "频道",
  "sections.empty": "加入或创建一个房间",

  "surface.settings": "设置",
  "surface.search": "搜索",
  "surface.newMessage": "新消息",
  "surface.invite": "邀请",
  "surface.join": "加入房间",
  "surface.create": "创建房间",
  "surface.attach": "附件",
  "surface.sticker": "贴纸",
  "surface.emoji": "表情",
  "surface.close": "关闭",

  "chat.title": "聊天",
  "chat.notSignedIn": "未登录",
  "chat.keyMissing": "加密密钥尚未设置",
  "chat.noRoom": "没有打开的房间",
  "chat.loadOlder": "加载更早的消息",
  "chat.back": "返回房间列表",
  "room.topic": "话题",
  "room.members": "{count} 位成员",
  "room.membersOne": "1 位成员",

  "composer.label": "消息",
  "composer.placeholder": "输入消息",
  "composer.send": "发送",
  "composer.attach": "添加附件",
  "composer.sticker": "贴纸",
  "composer.emoji": "表情",
  "composer.tray": "待发送的文件",

  "router.opening": "正在打开 maski",
  "router.open": "打开客户端",
} as const;

export type ZhCatalog = typeof zhCN;
