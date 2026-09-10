import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardLearnPage());
  grid.appendChild(cardClassroom());
}

function cardLearnPage(): HTMLElement {
  const card = makeCard('📚', 'The Learn Tab (Financial Education)');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The <strong>Learn</strong> page (labeled "Learn" in the sidebar) provides plain-language financial education with interactive calculators that pull from your real budget data where available. Five tabs cover:</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Debt Basics</strong> — What is APR?, The Minimum Payment Trap (interactive calculator), Avalanche vs. Snowball.</div></div>
      <div class="help-step"><span class="help-step-num">📊</span><div class="help-step-body"><strong>Budgeting</strong> — The 50/30/20 Rule (with your live data), Emergency Fund calculator, Zero-Based Budgeting.</div></div>
      <div class="help-step"><span class="help-step-num">📈</span><div class="help-step-body"><strong>Credit</strong> — Utilization calculator, What Makes a Credit Score?, Balance Transfers.</div></div>
      <div class="help-step"><span class="help-step-num">💰</span><div class="help-step-body"><strong>Saving &amp; Investing</strong> — Compound Interest chart (drag the years slider), Savings Rate, Opportunity Cost of Debt.</div></div>
      <div class="help-step"><span class="help-step-num">🔑</span><div class="help-step-body"><strong>Privacy &amp; Security</strong> — Public/Private Keys, How Financial Finger Uses Your Keys, Passphrases, The Same Ideas Everywhere.</div></div>
    </div>
  `;
  return card;
}

function cardClassroom(): HTMLElement {
  const card = makeCard('🏫', 'Financial Finger in the Classroom');
  card.className += ' help-classroom-card';
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Financial Finger is well-suited for educational settings — a financial literacy class, a personal finance unit, or a home-economics course. The offline-first, privacy-first design means students work with realistic data without sharing anything with a cloud service.</p>
      <p><strong>The "Financial Universe" model:</strong> a teacher sets up one installation as the <em>master household</em> and students each set up their own. Here's how it works:</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
      <div>
        <div style="font-weight:700;margin-bottom:var(--space-2);color:var(--ff-navy)">Teacher Setup</div>
        <div class="help-steps">
          <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body">Complete the six-step setup wizard. Name the household something like "Dollar Farm — Teacher".</div></div>
          <div class="help-step"><span class="help-step-num">2️⃣</span><div class="help-step-body">Create the <strong>expense categories</strong> all students will use (Housing, Food, Transportation, etc.).</div></div>
          <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body">Add a set of <strong>template recurring expenses</strong> representing a typical household's bills.</div></div>
          <div class="help-step"><span class="help-step-num">4️⃣</span><div class="help-step-body">Export the database (<strong>Settings → Export</strong>) encrypted to your own public key.</div></div>
          <div class="help-step"><span class="help-step-num">5️⃣</span><div class="help-step-body">Share the <code>.ffx</code> file with students (USB drive, shared folder, etc.).</div></div>
        </div>
      </div>
      <div>
        <div style="font-weight:700;margin-bottom:var(--space-2);color:var(--ff-green)">Student Setup</div>
        <div class="help-steps">
          <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body">Complete the setup wizard — generate their own key pair and name their household.</div></div>
          <div class="help-step"><span class="help-step-num">2️⃣</span><div class="help-step-body">Go to <strong>Settings → Import</strong>, load the teacher's <code>.ffx</code> file, enter the <em>teacher's</em> private key and passphrase (provided by the teacher for classroom use), and import with <strong>Merge</strong>.</div></div>
          <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body">Add their own <strong>household members</strong> and <strong>income sources</strong> — a realistic hypothetical income scenario assigned by the teacher or chosen by the student.</div></div>
          <div class="help-step"><span class="help-step-num">4️⃣</span><div class="help-step-body">Begin tracking their household: log bill payments, record debt accounts, check their Budget page, and explore What If? scenarios.</div></div>
        </div>
      </div>
    </div>
    <div class="help-callout" style="margin-top:var(--space-4)">
      <strong>Classroom exercise ideas:</strong> Compare Debt pages across students using Avalanche vs. Snowball — who pays off a shared scenario fastest? Use What If? to model a raise, a new car payment, or moving to a different city. Run the Compound Interest visualizer in the Learn tab and discuss why paying down debt early matters more than chasing investment returns early in life.
    </div>
  `;
  return card;
}
