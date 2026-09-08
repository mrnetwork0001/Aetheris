/**
 * Value-flow diagram for the landing page. Pure SVG + CSS so it renders on the
 * server, scales to any width, and costs nothing to animate.
 */
const NODE_FILL = "rgba(255,255,255,0.035)";
const NODE_STROKE = "rgba(255,255,255,0.12)";

interface NodeProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  accent: string;
}

function Node({ x, y, w, h, title, subtitle, accent }: NodeProps) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="12"
        fill={NODE_FILL}
        stroke={NODE_STROKE}
        strokeWidth="1"
      />
      <rect x={x + 14} y={y} width={w - 28} height="1" fill={accent} opacity="0.5" />
      <text
        x={x + w / 2}
        y={y + h / 2 - 5}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="13"
        fontWeight="600"
      >
        {title}
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 13}
        textAnchor="middle"
        fill="rgba(203,213,225,0.55)"
        fontSize="10.5"
      >
        {subtitle}
      </text>
    </g>
  );
}

export function FlowDiagram() {
  return (
    <figure className="relative">
      <svg
        viewBox="0 0 940 360"
        className="w-full"
        role="img"
        aria-labelledby="flow-title flow-desc"
      >
        <title id="flow-title">Aetheris value flow</title>
        <desc id="flow-desc">
          A client funds a job into the Aetheris agency treasury on Hedera EVM. The agency
          dispatches sub-tasks to specialised sub-agents, settles each one through the Hedera
          Token Service, anchors every milestone to the Hedera Consensus Service, indexes those
          events with The Graph, and rebalances the remaining margin through 1inch.
        </desc>

        <defs>
          <linearGradient id="flow-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6d7cff" />
            <stop offset="100%" stopColor="#38e8ff" />
          </linearGradient>
          <linearGradient id="flow-line-gold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38e8ff" />
            <stop offset="100%" stopColor="#ffc857" />
          </linearGradient>
        </defs>

        {/* Client -> Core */}
        <path
          d="M172 78 H330"
          fill="none"
          stroke="url(#flow-line)"
          strokeWidth="1.5"
          className="animate-dash"
        />
        {/* Core -> sub-agents */}
        <path
          d="M470 78 H548 Q568 78 568 98 V150"
          fill="none"
          stroke="url(#flow-line)"
          strokeWidth="1.5"
          className="animate-dash"
        />
        <path d="M470 78 H768" fill="none" stroke="url(#flow-line)" strokeWidth="1.5" className="animate-dash" />
        <path
          d="M470 78 H548 Q568 78 568 98 V226 H768"
          fill="none"
          stroke="url(#flow-line)"
          strokeWidth="1.5"
          className="animate-dash"
        />
        {/* Core -> settlement rail */}
        <path
          d="M400 108 V196"
          fill="none"
          stroke="url(#flow-line-gold)"
          strokeWidth="1.5"
          className="animate-dash"
        />
        {/* Settlement -> HCS log */}
        <path d="M540 226 H628" fill="none" stroke="url(#flow-line-gold)" strokeWidth="1.5" className="animate-dash" />
        {/* HCS -> subgraph */}
        <path d="M688 256 V286" fill="none" stroke="rgba(56,232,255,0.5)" strokeWidth="1.5" className="animate-dash" />
        {/* Retained margin -> treasury */}
        <path
          d="M400 256 V272 H126 V286"
          fill="none"
          stroke="rgba(255,200,87,0.45)"
          strokeWidth="1.5"
          className="animate-dash"
        />

        <Node x={32} y={48} w={140} h={60} title="Client" subtitle="Privy · World ID" accent="#6d7cff" />
        <Node
          x={330}
          y={48}
          w={140}
          h={60}
          title="Agency Core"
          subtitle="Hedera EVM escrow"
          accent="#38e8ff"
        />
        <Node x={768} y={26} w={148} h={52} title="Security audit" subtitle="sentinel.eth" accent="#38e8ff" />
        <Node x={768} y={124} w={148} h={52} title="Code generation" subtitle="forge.eth" accent="#6d7cff" />
        <Node x={768} y={200} w={148} h={52} title="Market research" subtitle="oracle.eth" accent="#a78bfa" />
        <Node x={330} y={196} w={210} h={60} title="HTS micro-settlement" subtitle="sub-second, micro-cent fees" accent="#ffc857" />
        <Node x={628} y={196} w={120} h={60} title="HCS log" subtitle="immutable audit" accent="#ffc857" />
        <Node x={628} y={286} w={188} h={50} title="The Graph subgraph" subtitle="real-time analytics" accent="#38e8ff" />
        <Node x={32} y={286} w={188} h={50} title="Agency treasury" subtitle="1inch rebalancing" accent="#ffc857" />

        <circle cx="400" cy="78" r="3.5" fill="#38e8ff" className="animate-breathe" />
        <circle cx="400" cy="226" r="3.5" fill="#ffc857" className="animate-breathe" />
      </svg>
      <figcaption className="mt-4 text-center text-xs text-slate-500">
        One escrowed deposit fans out to specialised sub-agents, settles per-task on HTS, and
        anchors every milestone to HCS — indexed by The Graph in real time.
      </figcaption>
    </figure>
  );
}
