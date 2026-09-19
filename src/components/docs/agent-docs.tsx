const tools = [
  ["get_assets", "Supported stocks, canonical addresses, and leverage presets"],
  [
    "get_market_state",
    "Fresh pricing and whether new leveraged positions can open",
  ],
  ["get_credit_pool", "Available lending credit"],
  ["quote_open", "Position sizing and estimated borrowing"],
  ["get_position", "Live Position NFT ownership, debt, and health"],
  ["prepare_open", "Unsigned Base transactions for the intended wallet"],
] as const;

const mcpConfig = `{
  "mcpServers": {
    "margin-call": {
      "url": "https://margincall.fun/api/mcp"
    }
  }
}`;

const prepareExample = String.raw`# Replace with the Base address that will sign.
WALLET=0xYourBaseAddress
curl -X POST https://margincall.fun/api/agent/prepare-open \
  -H 'Content-Type: application/json' \
  -d "{\"wallet\":\"$WALLET\",\"asset\":\"NVDAc\",\"stockAmount\":\"1000000\",\"leverage\":12500}"`;

function CodeBlock({ label, children }: { label: string; children: string }) {
  return (
    <pre tabIndex={0} aria-label={label}>
      <code>{children}</code>
    </pre>
  );
}

export function AgentDocs() {
  return (
    <section className="docs-agents" aria-labelledby="agents">
      <h2 id="agents" tabIndex={-1}>
        Agents &amp; builders
      </h2>
      <p>
        Give your agent access to leveraged tokenized-stock positions on Base.
        Bring any Base-capable wallet: Dynamic, Bankr, Coinbase, or your own
        signer.
        <strong> Dynamic is not required.</strong> It is the reference demo for
        agents that start without a wallet. Your agent runs in your own runtime;
        this website is the visual product surface.
      </p>
      <h3>Bring your own wallet</h3>
      <ol className="docs-agent-flow">
        <li>
          Your agent queries Margin Call’s public API or MCP for assets,
          pricing, credit, and quotes.
        </li>
        <li>
          It acquires the canonical supported stock through its own swap
          provider.
        </li>
        <li>
          Margin Call prepares unsigned transactions for the intended Base
          wallet.
        </li>
        <li>
          Your wallet signs and submits; the Position NFT belongs to the calling
          wallet.
        </li>
      </ol>
      <p>
        Public reads and quotes need no authentication, API key, wallet, or
        caller-supplied RPC when using the hosted endpoints. Preparation needs
        your wallet address and sufficient stock. A wallet is needed to sign
        onchain actions; any compatible Base signer can execute the prepared
        transactions.
      </p>
      <dl className="docs-agent-boundaries">
        <div>
          <dt>Margin Call</dt>
          <dd>
            Supported assets, market pricing, credit/readiness, quotes, unsigned
            preparation, Base contracts, and Position NFTs.
          </dd>
        </div>
        <div>
          <dt>Your agent</dt>
          <dd>Reasoning and decisions in your own runtime.</dd>
        </div>
        <div>
          <dt>Your wallet provider</dt>
          <dd>Identity/address, signing, and broadcasting transactions.</dd>
        </div>
        <div>
          <dt>Your swap provider</dt>
          <dd>
            Acquiring the required supported stock through Uniswap, existing
            wallet tooling, or another available route.
          </dd>
        </div>
      </dl>
      <p>
        Already have a Bankr-style agent with a Base wallet? Query supported
        assets, use its existing swap capability to acquire the exact stock
        token, call quote/prepare, then sign and submit with that same wallet.
        No Dynamic setup is needed; this is a portability example, not a Bankr
        integration.
      </p>

      <h3>Public API / MCP quickstart</h3>
      <p>
        HTTP: <code>https://margincall.fun/api/agent</code>
        <br />
        Streamable HTTP MCP: <code>https://margincall.fun/api/mcp</code>
      </p>
      <p>In a client supporting remote Streamable HTTP MCP, add:</p>
      <CodeBlock label="MCP connection configuration">{mcpConfig}</CodeBlock>
      <dl className="docs-agent-tools">
        {tools.map(([name, description]) => (
          <div key={name}>
            <dt>
              <code>{name}</code>
            </dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
      <p>Try this prompt in your agent:</p>
      <blockquote>
        Check whether I can open a 1.25x NVDAc position right now and prepare
        the transactions if I can.
      </blockquote>
      <p>
        Start with <code>GET /api/agent/assets</code> and{" "}
        <code>GET /api/agent/market-state?asset=NVDAc</code>, then{" "}
        <code>POST /api/agent/quote-open</code>. Once the wallet holds stock,
        prepare the open:
      </p>
      <CodeBlock label="Prepare an unsigned 1.25x NVDAc position">
        {prepareExample}
      </CodeBlock>
      <p>
        <code>stockAmount</code> is a decimal string in base units:{" "}
        <code>&quot;1000000&quot;</code>
        means 0.01 NVDAc (8 decimals). Leverage <code>12500</code> means 1.25x.
        The returned <code>transactions</code> contain unsigned <code>to</code>,
        <code> data</code>, <code>value</code>, and <code>chainId</code> (8453
        for Base). The public service never signs or broadcasts.
      </p>
      <p>
        Check <code>ok</code> before using a response. Refusals can have HTTP
        status 200; branch on <code>code</code> and stop if{" "}
        <code>ok: false</code>. Submit transactions in order from the supplied
        wallet, waiting for each successful receipt before continuing. Stop on a
        failed receipt. Decode
        <code> PositionOpened</code> from the open receipt for the token ID,
        then call <code>get_position</code>. Preparation is not a guarantee of
        execution.
      </p>
      <p>
        Fresh market pricing is typically available during regular U.S. trading
        hours, Monday–Friday, excluding market holidays. When fresh pricing is
        unavailable, Margin Call pauses new leveraged positions rather than
        relying on stale prices. Do not silently fall back to 1.0x. Live pricing
        still requires an enabled asset, enough credit and stock, and successful
        execution.
      </p>

      <h3>Dynamic reference demo: start without a wallet</h3>
      <p>
        Run the demo locally from the repository. In Dynamic, enable embedded
        wallets and multiple embedded wallets per chain. Configure
        <code> DYNAMIC_ENVIRONMENT_ID</code> (or{" "}
        <code>NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID</code>),
        <code> DYNAMIC_API_TOKEN</code>, and{" "}
        <code>DYNAMIC_WALLET_PASSWORD</code>. Keep credentials server-side. Set{" "}
        <code>UNISWAP_API_KEY</code> for acquisition. A provisioned{" "}
        <code>BASE_RPC_URL</code> is recommended for the demo; otherwise it
        falls back to <code>NEXT_PUBLIC_BASE_RPC_URL</code> or the public Base
        RPC. These credentials are for the reference demo, not public API
        access.
      </p>
      <CodeBlock label="Dynamic reference demo commands">{`# 1. Provision or resolve a Base wallet; note its address.
pnpm agent:wallet

# 2. Manually fund that address with Base ETH for gas and USDC.
# 3. Acquire supported stock through Uniswap (spends USDC).
pnpm agent:wallet --acquire --asset NVDAc --usdc 2

# 4. Check pricing, prepare, sign, and submit a 1.25x open.
pnpm agent:wallet --open --asset NVDAc`}</CodeBlock>
      <p>
        The open command defaults to the wallet’s full balance of the chosen
        stock; use <code>--stock</code> with a human decimal amount to limit it.
        If you combine <code>--acquire --open</code>, acquisition runs before
        the open’s pricing gate, so a stock swap may complete even when opening
        is refused.
      </p>
      <ul>
        <li>
          <strong>Pricing unavailable:</strong> the open step refuses to create
          leveraged debt and submits no open transactions. Refusing is a valid
          outcome.
        </li>
        <li>
          <strong>Pricing live and checks pass:</strong> Dynamic signs and
          submits, the demo waits for successful receipts, and the Position NFT
          is minted to the Dynamic wallet.
        </li>
      </ul>
      <p>
        Follow the demo stages:{" "}
        <a href="https://github.com/hurley87/margin-call/issues/490">
          Dynamic wallet (#490)
        </a>
        ,{" "}
        <a href="https://github.com/hurley87/margin-call/issues/491">
          public tools (#491)
        </a>
        ,{" "}
        <a href="https://github.com/hurley87/margin-call/issues/492">
          stock acquisition (#492)
        </a>
        , and{" "}
        <a href="https://github.com/hurley87/margin-call/issues/493">
          wallet-agnostic financed open (#493)
        </a>
        .
      </p>
      <p>
        See the{" "}
        <a href="https://github.com/hurley87/margin-call/blob/main/docs/agent-api.md">
          full API reference and execution example
        </a>
        . The public tools currently read and prepare opens; they do not expose
        repay, close, or liquidate tools, hosted agent accounts, or autonomous
        position management.
      </p>
    </section>
  );
}
