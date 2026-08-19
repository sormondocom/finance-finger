import type { MascotTrigger } from '@/types';

const BUCK_LINES: Record<MascotTrigger, string[][]> = {
  greeting: [
    ["Well now, good to see ya.", "Let's see what the numbers say today."],
    ["Mornin'! Pull up a chair.", "Plenty of figurin' to do."],
  ],
  'minimum-payment-trap': [
    [
      "Hold yer horses.",
      "Payin' just the minimum on that card? At that rate you'll be payin' interest 'til the cows come home.",
      "Toss a little extra at it — it adds up faster than you'd think.",
    ],
    [
      "Now I ain't one to pry, but...",
      "That minimum payment plan stretches out longer than a summer drought.",
      "Even $25 more a month makes a real dent.",
    ],
  ],
  'negative-cashflow': [
    [
      "Whoa there, partner.",
      "Them expenses are outpacing your income in this scenario.",
      "Might want to cinch that belt a notch before committin' to this plan.",
    ],
  ],
  'debt-free-improvement': [
    [
      "Well, slap my knee!",
      "With that extra payment you'd be debt-free a whole {months} months sooner.",
      "That's {interest} in interest you'd keep in your own pocket.",
    ],
    [
      "Now THAT'S figurin'!",
      "Add {amount} a month and you're clear by {date}.",
      "Your future self is gonna buy you a sweet tea.",
    ],
  ],
  'budget-milestone': [
    [
      "Hot dog!",
      "You just hit your {category} budget goal for the month.",
      "Stick to it and them savings start growin' like corn in July.",
    ],
  ],
  'payment-due': [
    [
      "Partner, heads up.",
      "{names} — your payment's comin' due within the week.",
      "Get it wrangled before that deadline rides on by.",
    ],
    [
      "Just a friendly nudge.",
      "You've got a payment due real soon: {names}.",
      "Don't let it slip — late fees pile up faster than you'd think.",
    ],
  ],
  'payment-overdue': [
    [
      "Whoa there, partner.",
      "{names} — that payment is PAST DUE.",
      "Get that settled quick before the fees pile on like tumbleweeds.",
    ],
    [
      "Now, I don't mean to alarm ya...",
      "But {names} missed a payment deadline.",
      "Every day you wait, the interest keeps right on bitin'. Go pay it now.",
    ],
  ],
  briefing: [
    [
      "Partner, I got your daily briefing right here.",
      "A few things need your attention — take a look below.",
    ],
    [
      "Mornin'! Before you ride off...",
      "I rounded up what needs wranglin' today. Don't let it slip by.",
    ],
  ],
  'expense-trend': [
    [
      "Hold up there, partner.",
      "That {bill} has gone over your {threshold} target {count} times now.",
      "Might be time to adjust your expectations — or your thermostat.",
    ],
    [
      "Now I ain't one to nag, but...",
      "{bill} keeps bustin' past that {threshold} target — happened {count} times lately.",
      "The budget ain't gonna fix itself. Might be worth raisin' that threshold.",
    ],
  ],
  custom: [["Howdy!", "Got something to tell ya."]],
};

const PENNY_LINES: Record<MascotTrigger, string[][]> = {
  greeting: [
    ["Hey there, sugar.", "Ready to get your finances straight?"],
    ["Well, look who showed up!", "Let's see what we're workin' with."],
  ],
  'minimum-payment-trap': [
    [
      "Honey, I say this with love.",
      "Minimum payments on credit cards are how the banks make their boat payments.",
      "Pay more than the minimum. Even a little helps a lot.",
    ],
    [
      "Alright, I'm gonna be straight with ya.",
      "That interest rate is doing you dirty and you're lettin' it.",
      "More than the minimum, every single time.",
    ],
  ],
  'negative-cashflow': [
    [
      "Mmm-mm.",
      "That scenario puts you in the red, hon.",
      "Let's find something to trim before this becomes a problem.",
    ],
  ],
  'debt-free-improvement': [
    [
      "Now THAT'S what I'm talking about!",
      "Pay {amount} more a month and you're free by {date}.",
      "That's {interest} in interest you'd keep for yourself.",
    ],
    [
      "Well, would you look at that.",
      "Shaving {months} months off your debt with one little change.",
      "The numbers don't lie, darlin'.",
    ],
  ],
  'budget-milestone': [
    [
      "Yes ma'am!",
      "You hit your {category} goal this month.",
      "Now don't go celebratin' by spendin' it all — that's not how this works.",
    ],
  ],
  'payment-due': [
    [
      "Sugar, heads up.",
      "{names} — your payment's comin' due within the week.",
      "Mark it on your calendar and let's get it taken care of, hon.",
    ],
    [
      "Just a gentle reminder, darlin'.",
      "You've got a payment due real soon: {names}.",
      "Better handle that before the deadline sneaks up on you.",
    ],
  ],
  'payment-overdue': [
    [
      "Oh honey, we've got a situation.",
      "{names} — your payment came due and went without being paid.",
      "Let's get that sorted before the fees get any uglier.",
    ],
    [
      "Listen, I say this with love.",
      "{names} is past due.",
      "Every day you wait costs more — go take care of that right now, sweet pea.",
    ],
  ],
  briefing: [
    [
      "Good morning, sugar! I put your daily briefing together.",
      "Here's what needs your attention today — let's get it handled.",
    ],
    [
      "Before you start your day, hon...",
      "I pulled together the items that need a little love from you.",
    ],
  ],
  'expense-trend': [
    [
      "Sugar, I need to tell you something.",
      "That {bill} has gone over your {threshold} target {count} times.",
      "Maybe it's time to update that number to something a little more realistic.",
    ],
    [
      "Okay, so here's the thing.",
      "{bill} keeps sneaking past your {threshold} budget — happened {count} times lately.",
      "I'm not judging, hon. But maybe adjust your expectations, or find a way to trim it.",
    ],
  ],
  custom: [["Hey now!", "Lean in — got somethin' to tell ya."]],
};

// ── Daily tips (delivered one at a time, rotating) ───────────────────────────

const TIPS_BUCK = [
  ["Credit utilization tip:", "Try to keep your balance below 30% of your credit limit. Below 10% is even better. It's a quiet way to keep your credit score respectable without payin' for anything extra."],
  ["On emergency funds:", "Three months of expenses, somewhere you can get to it quick. Not investments, not a CD — just sittin' there, bored, waitin' for when you need it. That's the whole plan."],
  ["On the avalanche method:", "Pay minimums on everything, then throw every extra dollar at the highest-APR card first. Mathematically, it's the fastest way out. The math don't lie."],
  ["On the snowball method:", "If motivation's a problem, knock out the smallest balance first. The quick win keeps folks goin'. Pick the strategy you'll actually stick to — that one wins."],
  ["On savings rate:", "Even 1% of your income set aside automatically adds up. You won't miss what you never see. Start small, raise it when you can."],
  ["On wants vs. needs:", "Needs keep you alive and workin'. Wants make life worth livin'. Both matter. The trick is knowin' which is which when you're about to swipe."],
  ["On interest timing:", "Credit card interest is usually calculated daily on your average daily balance. Paying early in the cycle — not just before the due date — can actually reduce what you owe."],
  ["On balance transfers:", "A 0% intro APR balance transfer can be a powerful tool if you've got discipline. Run the numbers first: transfer fees, the go-to rate after the promo ends, and whether you'll actually pay it off in time."],
];

const TIPS_PENNY = [
  ["On credit utilization:", "Keep your balances below 30% of your limit — ideally below 10%. Your credit score's watching, and it rewards restraint. Pay it down a little early each month if you can."],
  ["On emergency funds:", "Three to six months of expenses, liquid, accessible. Not exciting, not glamorous — but the one thing between a bad week and a financial disaster. Build it before you pay off low-interest debt."],
  ["On the avalanche:", "Highest interest rate first, minimums on everything else. It's the most efficient path out. Patience required, but the interest savings are real."],
  ["On the snowball:", "Smallest balance first for a quick payoff win. Some people need that momentum to keep going. There's no shame in it — the best plan is the one you follow."],
  ["On automating savings:", "Set it and forget it. Auto-transfer to savings on payday. You adjust your life to what's left, and the savings actually happen instead of disappearing into the month."],
  ["On needs vs. wants:", "Honest question before every non-essential purchase: is this filling a real gap, or filling an emotional one? Neither answer is wrong — but knowing the difference changes the math."],
  ["On daily interest:", "Credit cards accrue interest daily on your balance. Every day your balance sits there, it's working against you. Paying more than the minimum, even a little, cuts that daily damage."],
  ["On 0% offers:", "A 0% balance transfer can save you real money — if you read the fine print. Check the transfer fee, know when the rate resets, and have a real plan to pay it off before the clock runs out."],
];

export function getDailyTip(gender: 'buck' | 'penny'): string[] {
  const tips = gender === 'buck' ? TIPS_BUCK : TIPS_PENNY;
  // Rotate by day of year so the tip changes daily but is consistent within a day
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const tip = tips[dayOfYear % tips.length] ?? tips[0]!;
  return tip;
}

export function getLines(
  trigger: MascotTrigger,
  gender: 'buck' | 'penny',
  substitutions: Record<string, string> = {},
): string[] {
  const bank = gender === 'buck' ? BUCK_LINES : PENNY_LINES;
  const options = bank[trigger];
  const chosen = options[Math.floor(Math.random() * options.length)] ?? options[0] ?? ['Howdy!'];

  return chosen.map((line) =>
    line.replace(/\{(\w+)\}/g, (_, key) => substitutions[key] ?? `{${key}}`),
  );
}
