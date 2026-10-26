/**
 * Spam screening for the Gloam group, as pure functions with no network calls:
 * what a message is (promotion or a service pitch, a contact ask, a link to
 * another group, an OTC offer, another token's shill, a scam, someone posing as
 * the team), how sure the rules are, and what happens to the sender.
 *
 * bot.ts reads the sender's standing from the store, asks the model only about
 * messages the rules find unclear (answer.spamCheck), and acts. Every action is
 * silent in the group: no reply, no warning, no hand-off, so a spammer never
 * gets the attention that brings more of them. scripts/selftest-telegram.mts
 * checks the rules, the false positives included.
 */
import { COPYCAT_GLOAM, GLOAM_TOKEN } from "./knowledge";
import {
  INVITATION,
  LINK_RE,
  SAFE_HOSTS,
  askingForHelp,
  hostOf,
  linkAllowed,
  looksLikeQuestion,
  negated,
  norm,
  onHost,
  ownAddress,
  ownWords,
  plain,
  says,
  scorable,
  spellings,
  wordCount,
} from "./rules";
import type { TgEntity } from "./telegram";

export type SpamCategory = "scam" | "impersonation" | "link_spam" | "contact_spam" | "promo" | "otc" | "shill";

/** What the screen decided and how sure it is. `rule` names the rule, or "model:<why it asked>". */
export type Verdict = { category: SpamCategory; confidence: number; rule: string; source: "rule" | "model" };

/** Deleted and the sender banned; a member Glim knows gets a 24-hour mute on a first offence instead. */
export const BAN_CATEGORIES: ReadonlySet<SpamCategory> = new Set<SpamCategory>(["scam", "impersonation", "link_spam", "contact_spam", "promo"]);
/** Deleted; a second offence in 24 hours is a 24-hour mute, a third in a week a ban. */
export const LADDER_CATEGORIES: ReadonlySet<SpamCategory> = new Set<SpamCategory>(["otc", "shill"]);

/** A model verdict acts only this sure. Rule verdicts are 0.85 and up by construction. */
export const MODEL_ACT_AT = 0.8;
export const MUTE_SEC = 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// ---------------------------------------------------------------- words

const CONTACT_VERB = String.raw`(?:d\.?\s?m|p\.?\s?m|inbox|message|msg|contact|text|ping|write\s+to|reach\s+out\s+to|reach)`;
/** "DM me", "inbox us", "hit me up", "my DMs are open", "contact me on". */
const CONTACT_ASK = new RegExp(
  String.raw`\b${CONTACT_VERB}\s+(?:me|us)\b|\bhit\s+(?:me|us)\s+up\b|\b(?:send|drop|shoot)\s+(?:me|us)\s+(?:a\s+)?(?:dm|pm|message|msg|line|text)\b|\b(?:my|our)\s+(?:dms?|inbox|pms?)\s+(?:is|are)\s+open\b|\bdms?\s+(?:are\s+)?open\b|\b(?:d\.?\s?m|p\.?\s?m|inbox)\s+(?:for|to)\s|\b(?:d\.?\s?m|p\.?\s?m|inbox)\s+(?:collab\w*|partnership|promo\w*|details|business|deals?|offers?)\b`,
  "gi",
);
/** What a contact ask is for, when it says: details, business, a deal, a listing, signals. */
const CONTACT_PURPOSE =
  /\b(?:for|to\s+(?:get|discuss|talk\s+about|know|learn|hear))\s+(?:more\s+|the\s+|a\s+|some\s+)?(?:details?|info\w*|business|deals?|offers?|collab\w*|partnership|promo\w*|listing\w*|marketing|prices?|rates?|services?|signals?|calls?|profits?|invest\w*|trading|opportunit\w+|proposal|work|gigs?|hir(?:e|ing)|support|help|assistance|recovery|refunds?|airdrop\w*|whitelist\w*|allocation\w*|presale)\b/i;
/** "Check my bio", "link in bio", "see my profile". */
const BIO = /\b(?:check|see|visit|look\s+at|in|on)\s+(?:my|our)\s+(?:bio|profile|channel|page)\b|\blink\s+in\s+(?:my\s+|the\s+)?bio\b|\bbio\s+(?:for|has)\b/i;
const WHATSAPP = /\bwa\.me\/|\bchat\.whatsapp\.com\/|\bwhats\s?app\s+(?:me|us|\+?\d)|\b(?:signal|telegram|tg|whatsapp)\s*(?:me|:)\s*@?\w{4,}/i;
/** "contact @x", "join @x", "@x for listing": a handle given as the place to go. */
const CONTACT_HANDLE = new RegExp(
  String.raw`\b(?:${CONTACT_VERB}|talk\s+to|join|follow|check\s+out|visit|subscribe\s+to|add)\s+(?:me\s+|us\s+)?(?:at\s+|on\s+|via\s+)?@([a-z0-9_]{4,32})|@([a-z0-9_]{4,32})\s+(?:for|to\s+(?:get|buy|join))\s+(?:business|deals?|listing\w*|promo\w*|marketing|details|support|help|collab\w*|partnership|otc|signals?|calls?|more|gems?|alpha)`,
  "gi",
);

/** Services strangers sell to projects. */
const SERVICE =
  /\b(?:marketing|promotion(?:s|al)?|promo|kols?|influencers?|shill(?:ing|ers?)?|raids?|raiders?|calls?\s+(?:channel|group)|callers?|amas?|listings?|cmc|coinmarketcap|coingecko\s+listing|cex\s+listing|tier\s*[- ]?1|volume(?:\s+(?:bot|boost|service))?|trending|dexscreener\s+(?:trending|boost|ads?)|community\s+(?:growth|management|building|moderation)|(?:holders|members|investors)\s+(?:growth|reach|boost)|investor\s+reach|exposure|visibility|smart\s+contracts?\s+(?:development|dev|audits?)|(?:website|dapp|bot|app|token)\s+(?:development|developer|dev)|full[- ]?stack|web3\s+(?:development|developer|dev)|blockchain\s+(?:development|developer|dev)|graphic\s+design|logo\s+design|meme\s+(?:design|maker|creation)|stickers?\s+(?:design|pack)|video\s+(?:editing|editor)|ghost\s*writ\w+|copywrit\w+)\b/i;
/** "I offer", "our services", "for hire", "affordable": the selling half of a pitch. */
const FIRST_BUSINESS =
  /\b(?:(?:i|we)\s+(?:offer|provide|deliver|specialize\s+in|specialise\s+in|handle|run)|(?:my|our)\s+(?:services|agency|company|packages?|portfolio|clients?|network\s+of|team\s+(?:of|has|can|will))|for\s+hire|hire\s+(?:me|us)|available\s+for\s+(?:hire|work|projects?|gigs?|collab\w*)|affordable|guaranteed|price\s+list|(?:my|our)\s+rates)\b/i;
/** "We can boost", "I will promote": a first-person offer. */
const OFFER_VERB =
  /\b(?:i|we)\s*(?:can|will|could|would|'ll)\s+(?:help|assist|boost|grow|promote|push|market|scale|bring|get|list|pump|build|develop|design|manage|handle|provide|offer|deliver|increase|skyrocket)\b/i;
/** "I can help your project", "we will push your token". */
const OFFER_HELP =
  /\b(?:i|we)\s*(?:can|will|could|would|'ll)\s+(?:help|assist|boost|grow|promote|push|market|scale|bring|pump|skyrocket|increase|list|take)\s+(?:your|ur)\s+(?:project|token|coin|community|team|brand|chart|growth|marketing|holders|volume|visibility|presence)\b/i;
/** "I'm a professional crypto marketer", "we are a KOL agency", "I am a dev". */
const SELF_ROLE =
  /\b(?:i\s*'?\s*m|i\s+am|we\s*'?\s*re|we\s+are)\s+(?:an?\s+|the\s+)?(?:[\w-]+\s+){0,3}?(?:marketer|marketing\s+(?:expert|agency|team|manager|specialist|strategist|consultant)|promoter|promotion\s+(?:agency|team)|kol|influencer|shiller|caller|raider|growth\s+(?:hacker|manager|marketer)|listing\s+(?:agent|manager|expert)|developer|dev|designer|community\s+(?:manager|builder)|moderator|mod|advisor|consultant|ambassador|ama\s+host|copywriter|ghostwriter|video\s+editor|agency)\b/i;
/** Roles nobody in a project's group sells but promoters. */
const PROMO_ROLE = /\b(?:marketer|marketing|promoter|promotion|kol|influencer|shiller|caller|raider|growth|listing|agency)\b/i;
/** "Need a dev?", "need marketing?": the opener of a pitch, when a contact or bio follows. */
const NEED_ROLE =
  /\bneed\s+(?:an?\s+|any\s+|some\s+)?(?:dev|developer|marketer|promoter|moderator|mod|designer|kol|influencer|community\s+manager|listing|marketing|promotion|volume|trending|amas?|exposure|holders)\b/i;
const FOR_HIRE = /\b(?:devs?|developers?|designers?|marketers?|mods?|moderators?|promoters?)\s+for\s+hire\b|\bhire\s+(?:me|us|a\s+(?:dev|developer|marketer|designer))\b/i;
/** Promotion vocabulary, for the unclear and the new-member checks. */
const PROMO_WORD =
  /\b(?:promot\w+|promo|marketing|marketer|kols?|influencers?|listings?|cmc|coinmarketcap|volume\s+bot|trending|shill\w*|raids?|partnership|collab\w*|exposure|visibility|investor\s+reach|for\s+hire|ads|advertis\w+|sponsor\w*)\b/i;
/** Addressing the project as an outsider: "your project", "your token". */
const SECOND_PERSON = /\b(?:your|ur)\s+(?:project|token|coin|community|chart|brand|telegram|tg|group|holders|volume|marketing|listing|presence|visibility|growth|launch|website|dapp|socials?)\b/i;

/** "Who can I talk to", "can I speak with the dev", "I'd like to talk to the team". */
const TALK_TO_TEAM =
  /\b(?:who|how)\s+(?:can|do|should|could|would)\s+(?:i|we)\s+(?:talk|speak|reach|contact|get\s+in\s+touch|connect|chat|discuss)\b|\b(?:can|could|may)\s+i\s+(?:talk|speak|chat|discuss|connect)\s+(?:to|with)\s+(?:the\s+|a\s+|an\s+|your\s+)?(?:team|devs?|developers?|admins?|founders?|owners?|ceo|mods?|manager|management|someone\s+in\s+charge|project\s+lead)\b|\b(?:i|we)\s*(?:'d|would)?\s+(?:like|want|wanna|need)\s+to\s+(?:talk|speak|chat|discuss|connect)\s+(?:to|with)\s+(?:the\s+|a\s+|an\s+|your\s+)?(?:team|devs?|developers?|admins?|founders?|owners?|ceo|mods?|manager|management)\b|\bwho\s*(?:is|'s)\s+(?:the\s+)?(?:dev|admin|founder|owner|ceo|manager|in\s+charge)\s+here\b/i;
const BUSINESS =
  /\b(?:partnership|collab\w*|listing\w*|marketing|promot\w+|promo|business|proposal|investment|invest|opportunit\w+|offer|deal|amas?|kols?|cooperation|sponsor\w*|advertis\w+|ads)\b/i;
/** "We'd like a partnership", "collab with your project", "open to a partnership". */
const PARTNER_PITCH =
  /\b(?:i|we)\s*(?:would\s+like|'d\s+like|want|wanna|are\s+looking|am\s+looking|are\s+interested|am\s+interested|'re\s+interested|'m\s+interested|propose|have\s+an?\s+(?:proposal|offer|deal)|are\s+open|offer|represent)\b[^.!?\n]{0,60}\b(?:partnership|collab\w*|cooperation|cross[- ]?promo\w*|joint\s+venture|sponsorship)|\b(?:partnership|collab\w*|cooperation|cross[- ]?promo\w*)\s+(?:with|for|between)\s+(?:your|ur|you|us)\b|\b(?:interested\s+in|open\s+to|looking\s+for)\s+(?:an?\s+)?(?:partnership|collab\w*|cooperation|cross[- ]?promo\w*)/i;

const OTC = /\botc\b/i;
const TRADE_OFFER =
  /\b(?:selling|wts|wtb|want(?:ing)?\s+to\s+(?:buy|sell)|looking\s+to\s+(?:buy|sell)|i\s+(?:sell|buy)|i\s*'?m\s+(?:selling|buying)|we\s*'?re\s+(?:selling|buying)|for\s+sale|buying\s+(?:in\s+)?bulk|sell(?:ing)?\s+(?:my|some|cheap|at|below)|buy(?:ing)?\s+(?:at|below|cheap))\b/i;
const WHO_TRADES = /\b(?:who|anyone|anybody|someone|somebody)\s*(?:'s|\s+is|\s+wants?\s+to|\s+willing\s+to|\s+here)?\s+(?:selling|buying|sell|buy|swap(?:ping)?)\b/i;
const OTC_TERMS = /\b(?:escrow|discount|below\s+(?:market|price)|cheap(?:er)?|bulk|deal|desk)\b/i;

const TICKER_RE = /(?<![\w$])\$([a-z][a-z0-9]{1,9})\b/gi;
/** Tickers people name in normal talk here: $GLOAM, the coins Gloam runs on, majors and the stock tokens. */
const KNOWN_TICKERS = new Set(
  (
    "gloam eth weth btc wbtc sol usd usdc usdce usdt usdt0 usdg pathusd ousd eurc pyusd dai tsla amzn pltr nflx amd hood aapl nvda msft goog " +
    "googl meta spy qqq coin base op arb bnb zec xmr doge ton trx link avax"
  ).split(" "),
);
const PUMP =
  /\b(?:\d{2,5}\s?x|x\s?\d{2,5}|moon\w*|gems?|ape(?:\s+in|\s+now)?|aping|send(?:ing)?\s+it|pump(?:ing|s)?|low\s*cap|micro\s*cap|stealth\s+launch\w*|fair\s+launch\w*|just\s+launched|launching\s+(?:now|soon|today)|presale|don'?t\s+miss|early\s+(?:entry|gem|buyers?|birds?)|buy\s+now|get\s+in\s+(?:now|early|before)|going\s+(?:to\s+)?(?:\d+\s?x|parabolic|crazy|nuclear)|parabolic|next\s+(?:gem|big\s+thing)|printing|easy\s+money)\b/i;
const CA_WORD = /\b(?:ca|contract)\b/i;
const BUY_WORD = /\b(?:buy|ape|grab|get\s+in|load\s+up|chart)\b/i;
const EVM_ADDRESS = /\b0x[0-9a-f]{40}\b/gi;
/** A Solana-style mint ("...pump" on pump.fun, or base58 next to CA). */
const SOL_ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

const BRAND = String.raw`(?:gloam|glim)`;
const STAFF_ROLE = String.raw`(?:support(?:\s+team)?|team|admins?|mods?|moderators?|official|help\s*desk|customer\s+(?:care|service|support)|staff|devs?|developers?|founders?|co-?founders?|ceo|cto|management|security(?:\s+team)?|tech(?:nical)?\s+(?:team|support)|helpline|agents?|representatives?)`;
/** "I'm from the Gloam team", "we are Gloam support", "on behalf of Gloam". */
const IMPOSTOR_SELF = new RegExp(
  String.raw`\b(?:i\s*'?\s*m|i\s+am|we\s*'?\s*re|we\s+are)\s+(?:from\s+|with\s+|on\s+|part\s+of\s+|one\s+of\s+)?(?:the\s+|an?\s+)?(?:official\s+)?${BRAND}(?:'s)?\s+${STAFF_ROLE}\b|\b(?:on\s+behalf\s+of|representing)\s+(?:the\s+)?${BRAND}\b`,
  "i",
);
/** A message that opens as "Gloam support", "Official Glim team". */
const IMPOSTOR_OPEN = new RegExp(String.raw`^\W*(?:official\s+)?${BRAND}\s+${STAFF_ROLE}\b`, "i");
/** "Gloam support ... DM me", "contact the Gloam admin at @x". */
const IMPOSTOR_CONTACT = new RegExp(
  String.raw`\b${BRAND}\s+${STAFF_ROLE}\b[^.!?\n]{0,40}?\b${CONTACT_VERB}\s+(?:me|us|@\w+)|\b${CONTACT_VERB}\s+(?:me|us)\b[^.!?\n]{0,30}?\b(?:for|as|from)\s+(?:the\s+)?${BRAND}\s+${STAFF_ROLE}\b|\b${CONTACT_VERB}\s+(?:the\s+)?${BRAND}\s+${STAFF_ROLE}\s+(?:at|on|via)\s+@`,
  "i",
);

/** An airdrop, giveaway, bonus or "first 100" offered ... */
const DROP_OFFER =
  /\b(?:airdrop\w*|giveaway\w*|give\s+away|free\s+(?:tokens?|usdt|usdc|eth|crypto|money|nfts?|mint|\$?\d)|bonus(?:es)?|rewards?|prizes?|winners?|first\s+\d+\s+(?:people|persons|users|members|holders|wallets)|claim\s+(?:your|ur)\s+(?:tokens?|airdrop|rewards?|bonus|allocation|prize|share))\b/i;
/** ... with the catch: claim now, connect, register, drop your wallet, DM me. */
const DROP_CTA =
  /\b(?:claim\s+(?:now|here|it|yours|today|fast|at)|connect\s+(?:your|ur)\s+wallets?|register|sign\s*up|(?:d\.?\s?m|p\.?\s?m|inbox)\s+(?:me|us)|send\s+(?:me|us)|click|visit|join\s+(?:now|here|us|the)|drop\s+(?:your|ur)\s+(?:wallets?|address(?:es)?|addy|evm|sol)|(?:comment|reply\s+with|post)\s+(?:your|ur)\s+(?:wallets?|address(?:es)?|addy)|participate|follow\s+(?:me|us|and)|retweet|tag\s+\d+\s+friends)\b/i;
/** Money schemes: passive income, daily profit, an account manager, signals. */
const MONEY_PITCH =
  /\b(?:passive\s+income|daily\s+(?:profits?|returns?|income)|guaranteed\s+(?:profits?|returns?)|investment\s+(?:plans?|platform|opportunit\w+|manager)|account\s+manager|trading\s+(?:signals?|mentor|mentorship)|forex|binary\s+options?|recover\s+(?:your\s+)?(?:lost|stolen|scammed)\s+(?:funds|crypto|money)|(?:earn|make)\s+\$?\d[\d,]*\s*(?:k|usd|usdt|dollars)?\s*(?:daily|weekly|a\s+day|per\s+day|a\s+week|per\s+week))\b/i;
/** "Follow me", "follow our channel": with a link or a handle, a pull somewhere else. */
const FOLLOW_ME = /\bfollow\s+(?:me|us|my|our)\b/i;
/** Thanks and greetings: a newcomer tagging the person who helped them is not a pitch. */
const CHATTY = /\b(?:thanks?|thank\s+you|thx|ty|gm|gn|hi|hello|hey|welcome|lol|haha|same|nice|great|congrats|agreed|exactly)\b/i;
/** A link with a call to come and do something there. */
const LINK_CTA =
  /\b(?:join|visit|click|tap|check\s+(?:out|it|this)|sign\s*up|register|earn|free|bonus|mint|claim|connect|play|bet|casino|start\s+earning|passive|profits?|invest|trade\s+(?:now|here)|download|install|vote)\b/i;

/** A promoter's display name: "GUL ceo promoter", "KOL Agency", "Crypto Marketing". */
const PROMO_NAME =
  /\b(?:promot\w*|marketing|marketer|kols?|listings?|agency|callers?|calls|shill\w*|pumps?|influencer|ads|advert\w*|cmc|coingecko|trending|volume|signals?|forex|investments?|recovery|crypto\s+ceo|web3\s+(?:marketing|growth|agency))\b/i;

// ---------------------------------------------------------------- links and handles

/** Explorers, faucets, charts and screenshot hosts a newcomer may post with a question. */
const NEWCOMER_HOSTS = [
  ...SAFE_HOSTS,
  "explorer.testnet.chain.robinhood.com",
  "explore.tempo.xyz",
  "explore.testnet.tempo.xyz",
  "basescan.org",
  "etherscan.io",
  "coinmarketcap.com",
  "geckoterminal.com",
  "dextools.io",
];

/** A t.me link to anywhere but this group, its message links, Glim's stickers or Glim. */
function foreignTelegram(host: string, path: string): boolean {
  if (!["t.me", "telegram.me", "telegram.dog"].includes(host)) return false;
  return !/^\/(?:gloamhq|c\/\d+|addstickers\/glimbygloam|glimforgloambot)(?:[/?#]|$)/i.test(path);
}

export type ScreenInput = {
  /** The message text, codes already masked (scanCodes). */
  text: string;
  /** The sender's display name. */
  name: { first_name?: string; last_name?: string };
  /** Entities, for links hidden behind words (text_link) and mentions. */
  entities?: TgEntity[];
  /** Where a forward came from, when it is one. */
  forwardedFrom?: string | null;
  /** Handles anyone may name: the bot, the team, the official accounts. Lower case, no "@". */
  okHandles: string[];
};

export type Screen = {
  /** What the rules are sure of, or null. */
  verdict: Verdict | null;
  /** A pitch that only counts from someone the group does not know (a partnership or "who do I talk to" pitch). */
  strangerVerdict: Verdict | null;
  /** Spam-shaped but not sure: worth one model check for a sender with no history. The reason, or null. */
  unclear: string | null;
  /** What a newcomer's first messages may not hold (a link, a handle, a contact ask, promo wording), as a category. */
  gate: SpamCategory | null;
  /** Spam-shaped, acted on or not: the helper never replies to it. */
  quiet: boolean;
};

function linksOf(text: string, entities: TgEntity[] = []): string[] {
  const hidden = entities.filter((e) => e.type === "text_link" && typeof e.url === "string").map((e) => e.url!);
  return [...(text.match(LINK_RE) ?? []), ...hidden];
}

function handlesOf(text: string): string[] {
  return [...text.matchAll(/(?<![\w@.])@([a-z0-9_]{4,32})\b/gi)].map((m) => m[1]!.toLowerCase());
}

/** A contact ask said outright: not negated, not someone asking for help, not an invitation ("DM me if you want to pair up"). */
function contactAsk(t: string): { any: boolean; purpose: boolean } {
  let any = false;
  let purpose = false;
  for (const m of t.matchAll(CONTACT_ASK)) {
    if (negated(t, m.index, m[0]) || askingForHelp(t, m)) continue;
    const after = t.slice(m.index + m[0].length);
    if (INVITATION.test(after)) continue;
    any = true;
    const sentence = after.split(/[.!?\n]/)[0] ?? "";
    if (CONTACT_PURPOSE.test(sentence) || CONTACT_PURPOSE.test(t.slice(Math.max(0, m.index - 60), m.index))) purpose = true;
  }
  return { any, purpose };
}

function otherTickers(t: string): string[] {
  return [...t.matchAll(TICKER_RE)].map((m) => m[1]!.toLowerCase()).filter((x) => !KNOWN_TICKERS.has(x));
}

const COPYCAT = new Set(COPYCAT_GLOAM.map((a) => a.toLowerCase()));

function otherAddresses(raw: string): { evm: string[]; copycat: boolean; sol: string[] } {
  const evm = (raw.match(EVM_ADDRESS) ?? []).map((a) => a.toLowerCase()).filter((a) => a !== GLOAM_TOKEN.address.toLowerCase() && !ownAddress(a));
  const sol = (raw.match(SOL_ADDRESS) ?? []).filter((a) => /[a-z]/.test(a) && /[A-Z]/.test(a) && /\d/.test(a));
  return { evm: evm.filter((a) => !COPYCAT.has(a)), copycat: evm.some((a) => COPYCAT.has(a)), sol };
}

/** The display name as a reader sees it. */
function nameOf(n: ScreenInput["name"]): string {
  return plain(`${n.first_name ?? ""} ${n.last_name ?? ""}`).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Screens one message from someone who is not the team. Fast rules first; what
 * they can't settle comes back as `unclear` for one model check. Plain opinions
 * ("undervalued", "gm", hype about $GLOAM) come back clean.
 */
export function screen(i: ScreenInput): Screen {
  const raw = i.text;
  const own = ownWords(raw);
  const readings = spellings(scorable(own));
  const links = linksOf(raw, i.entities);
  const hosts = links.map(hostOf);
  const tgLinks = hosts.filter((h) => foreignTelegram(h.host, h.path));
  // links to anywhere but the official pages, explorers, charts, wallets and screenshot hosts (t.me is counted apart)
  const offsite = links.filter((l, n) => {
    const h = hosts[n]!;
    if (linkAllowed(l) || ["t.me", "telegram.me", "telegram.dog"].includes(h.host)) return false;
    return !NEWCOMER_HOSTS.some((s) => onHost(h.host, s));
  });
  const handles = handlesOf(raw).filter((h) => !i.okHandles.includes(h));
  const question = raw.includes("?") || looksLikeQuestion(raw);
  const promoName = PROMO_NAME.test(nameOf(i.name));
  const addresses = otherAddresses(raw);
  const forwarded = i.forwardedFrom === "channel" || i.forwardedFrom === "chat";

  const hits: Verdict[] = [];
  const add = (category: SpamCategory, confidence: number, rule: string) => hits.push({ category, confidence, rule, source: "rule" });
  let strangerVerdict: Verdict | null = null;
  let contactAny = false;
  let contactPurpose = false;
  let tickers: string[] = [];
  let offer = false;
  let pitch = false;
  let talkToTeam = false;
  let business = false;

  for (const t of readings) {
    const contact = contactAsk(t);
    contactAny ||= contact.any;
    contactPurpose ||= contact.purpose;
    const bio = BIO.test(t);
    const whatsapp = WHATSAPP.test(t);
    tickers = tickers.length ? tickers : otherTickers(t);
    talkToTeam ||= TALK_TO_TEAM.test(t);
    business ||= BUSINESS.test(t);
    const reach = contact.any || bio || whatsapp;
    const selfRole = SELF_ROLE.exec(t);
    const firstBusiness = FIRST_BUSINESS.test(t);
    const offerVerb = OFFER_VERB.test(t);
    offer ||= firstBusiness || OFFER_HELP.test(t) || FOR_HIRE.test(t);
    pitch ||= PROMO_WORD.test(t) && (SECOND_PERSON.test(t) || offerVerb || firstBusiness || Boolean(selfRole));

    // posing as the team, in words
    if (says(IMPOSTOR_SELF, t)) add("impersonation", 0.97, "support_impostor");
    else if (IMPOSTOR_OPEN.test(t) && (reach || /^\W*\w+\s+\w+\s*[:,-]/.test(t))) add("impersonation", 0.97, "support_impostor");
    else if (IMPOSTOR_CONTACT.test(t)) add("impersonation", 0.95, "support_impostor");

    // bait and money schemes
    if (says(DROP_OFFER, t) && says(DROP_CTA, t)) add("scam", 0.9, "drop_bait");
    if (says(MONEY_PITCH, t) && (reach || offsite.length)) add("scam", 0.9, "money_pitch");

    // contact and link spam
    if (tgLinks.length) add("link_spam", 0.95, "telegram_link");
    if (FOLLOW_ME.test(t) && (links.length || handles.length)) add("contact_spam", 0.9, "follow_me");
    if (whatsapp) add("contact_spam", 0.95, "whatsapp");
    if (bio) add("contact_spam", 0.95, "bio_link");
    for (const m of t.matchAll(CONTACT_HANDLE)) {
      const h = (m[1] ?? m[2] ?? "").toLowerCase();
      if (h && !i.okHandles.includes(h) && !negated(t, m.index, m[0])) add("contact_spam", 0.92, "contact_handle");
    }
    if (contact.purpose) add("contact_spam", 0.9, "contact_purpose");
    if (offsite.length && LINK_CTA.test(t)) add("link_spam", 0.9, "link_cta");

    // service and promotion pitches
    if (OFFER_HELP.test(t)) add("promo", 0.92, "offer_help");
    if (FOR_HIRE.test(t)) add("promo", 0.92, "for_hire");
    if (selfRole && (reach || firstBusiness || offerVerb || SECOND_PERSON.test(t))) add("promo", 0.95, "self_pitch");
    if (NEED_ROLE.test(t) && (reach || firstBusiness)) add("promo", 0.95, "need_pitch");
    if (SERVICE.test(t) && (reach || firstBusiness || offerVerb)) add("promo", promoName ? 0.97 : 0.92, "service_pitch");
    if (PROMO_WORD.test(t) && reach) add("promo", 0.93, "promo_contact");
    if (promoName && (reach || firstBusiness || offerVerb || talkToTeam || SERVICE.test(t) || (selfRole && PROMO_ROLE.test(selfRole[0])))) {
      add("promo", 0.93, "promo_name");
    }
    if (forwarded && (links.length || handles.length || otherTickers(t).length || PROMO_WORD.test(t) || reach)) add("promo", 0.9, "forwarded_promo");

    // OTC buying and selling
    const trade = TRADE_OFFER.test(t) || WHO_TRADES.test(t);
    if (OTC.test(t) && (trade || reach || OTC_TERMS.test(t))) add("otc", 0.95, "otc_offer");
    else if (trade && reach) add("otc", 0.92, "trade_contact");
    else if (TRADE_OFFER.test(t) && OTC_TERMS.test(t)) add("otc", 0.88, "trade_terms");

    // another token's shill
    const others = otherTickers(t);
    if (others.length && PUMP.test(t)) add("shill", 0.92, "ticker_shill");
    if (addresses.evm.length && (PUMP.test(t) || CA_WORD.test(t) || others.length) && !/\b(?:sent|send|paid|pay|received|tx|txn|transaction|wallet|address)\b/i.test(t)) {
      add("shill", 0.92, "ca_shill");
    }
    if (addresses.sol.length && (PUMP.test(t) || CA_WORD.test(t) || others.length)) add("shill", 0.9, "ca_shill");
    if (addresses.copycat && !question && (CA_WORD.test(t) || BUY_WORD.test(t) || PUMP.test(t))) add("shill", 0.9, "copycat_ca");

    // pitches that only count from strangers
    if (!strangerVerdict && says(PARTNER_PITCH, t)) strangerVerdict = { category: "promo", confidence: 0.88, rule: "partnership_pitch", source: "rule" };
    if (!strangerVerdict && TALK_TO_TEAM.test(t) && (BUSINESS.test(t) || promoName)) {
      strangerVerdict = { category: "promo", confidence: 0.88, rule: "talk_to_team", source: "rule" };
    }
  }

  // the strongest hit; a ban category wins a tie
  const verdict =
    hits.sort((a, b) => b.confidence - a.confidence || Number(BAN_CATEGORIES.has(b.category)) - Number(BAN_CATEGORIES.has(a.category)))[0] ?? null;

  const words = wordCount(norm(raw));
  let unclear: string | null = null;
  if (!verdict && !question && words >= 3) {
    if (promoName) unclear = "promo_name";
    else if (forwarded) unclear = "forwarded";
    else if (contactAny) unclear = "contact_ask";
    else if (offsite.length) unclear = "offsite_link";
    else if (pitch || offer) unclear = "promo_words";
    else if (talkToTeam) unclear = "talk_to_team";
    else if (tickers.length) unclear = "ticker";
  }

  let gate: SpamCategory | null = null;
  if (tgLinks.length || offsite.length) gate = "link_spam";
  else if (contactAny || (handles.length && !question && !CHATTY.test(own))) gate = "contact_spam";
  else if (pitch || offer) gate = "promo";

  const quiet =
    Boolean(verdict || strangerVerdict || unclear) ||
    contactAny ||
    offsite.length > 0 ||
    tickers.length > 0 ||
    promoName ||
    offer ||
    (talkToTeam && business);

  return { verdict, strangerVerdict, unclear, gate, quiet };
}

// ---------------------------------------------------------------- what happens to the sender

/** A past offence, kept a week. */
export type Offence = { at: number; category: SpamCategory };

/** What Glim knows about a member when it is about to act. */
export type Standing = {
  /** Messages Glim saw from them before this one (kept 30 days). */
  priorMsgs: number;
  /** When Glim first saw them talk (kept 30 days), or null. */
  firstSeen: number | null;
  /** When they joined, when Glim saw it in the last 24 hours, or null. */
  joinedAt: number | null;
  /** Their offences in the last week, newest first. */
  offences: Offence[];
  /** An admin lifted a removal of theirs (/unban): Glim's guesses leave them alone for 30 days. */
  vouched: boolean;
  /** Clock hours, a day to three days ago, they talked in (the group's activity counters). */
  oldActiveHours: number;
};

/** A member who has been around and talked normally: seen talking over a day ago, and no offence this week. */
export function established(s: Standing, now: number): boolean {
  if (s.offences.some((o) => o.at > now - WEEK_MS)) return false;
  if (s.vouched) return true;
  if (s.priorMsgs >= 3 && s.firstSeen !== null && s.firstSeen <= now - DAY_MS) return true;
  return s.oldActiveHours >= 2;
}

/** Joined in the last 24 hours and these are among their first few messages. */
export function newcomer(s: Standing, now: number): boolean {
  return !s.vouched && s.joinedAt !== null && now - s.joinedAt < DAY_MS && s.priorMsgs < 3;
}

export type Plan = { ban: boolean; muteSec: number; why: string };

/**
 * What happens after the message is deleted. With no standing (the store is
 * down) Glim fails safe: a rule verdict in a ban category still bans, a model
 * verdict and a ladder offence are only deleted.
 */
export function planFor(v: Verdict, s: Standing | null, now: number, gate = false): Plan {
  if (!s) return v.source === "rule" && BAN_CATEGORIES.has(v.category) ? { ban: true, muteSec: 0, why: "rule, store down" } : { ban: false, muteSec: 0, why: "store down" };
  if (gate) return { ban: true, muteSec: 0, why: "newcomer" };
  if (BAN_CATEGORIES.has(v.category)) {
    return established(s, now) ? { ban: false, muteSec: MUTE_SEC, why: "known member, first offence" } : { ban: true, muteSec: 0, why: "no history" };
  }
  const week = s.offences.filter((o) => o.at > now - WEEK_MS).length;
  const day = s.offences.filter((o) => o.at > now - DAY_MS).length;
  if (week >= 2) return { ban: true, muteSec: 0, why: "third offence this week" };
  if (day >= 1) return { ban: false, muteSec: MUTE_SEC, why: "second offence in 24 hours" };
  return { ban: false, muteSec: 0, why: "first offence" };
}

// ---------------------------------------------------------------- the model check

/** The model's categories, as the screen's. */
const MODEL_CATEGORY: Record<string, SpamCategory> = {
  promo: "promo",
  contact: "contact_spam",
  link: "link_spam",
  otc: "otc",
  shill: "shill",
  scam: "scam",
  impersonation: "impersonation",
};

export type SpamCheck = { spam: boolean; category: SpamCategory | null; confidence: number };

/**
 * The model's answer, strict: one JSON object and nothing else, with a boolean
 * `spam`, a known `category` when it is spam, and a `confidence` from 0 to 1.
 * Anything else is no answer, and no answer is never an action.
 */
export function parseSpamCheck(raw: string | null | undefined): SpamCheck | null {
  const t = (raw ?? "").trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return null;
  let j: unknown;
  try {
    j = JSON.parse(t);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  if (typeof o.spam !== "boolean" || typeof o.confidence !== "number" || !Number.isFinite(o.confidence) || o.confidence < 0 || o.confidence > 1) return null;
  const category = typeof o.category === "string" ? (MODEL_CATEGORY[o.category.toLowerCase()] ?? null) : null;
  if (o.spam && !category) return null;
  return { spam: o.spam, category: o.spam ? category : null, confidence: o.confidence };
}
