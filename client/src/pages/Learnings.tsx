import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Brain, ChevronDown, ChevronUp, Archive, Trash2, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Learning {
  id: string;
  memoryType: string;
  description: string;
  content: string;
  period: string | null;
  isStale: boolean;
  createdAt: string;
  updatedAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  profile: 'bg-blue-500/15 text-blue-400',
  fact: 'bg-cyan-500/15 text-cyan-400',
  budget: 'bg-emerald-500/15 text-emerald-400',
  goal: 'bg-green-500/15 text-green-400',
  pattern: 'bg-amber-500/15 text-amber-400',
  rule: 'bg-purple-500/15 text-purple-400',
  anomaly: 'bg-rose-500/15 text-rose-400',
  recommendation: 'bg-orange-500/15 text-orange-400',
};

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] || 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide uppercase ${color}`}>
      {type}
    </span>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function LearningCard({
  learning,
  onMarkStale,
  onDelete,
}: {
  learning: Learning;
  onMarkStale: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<'stale' | 'delete' | null>(null);

  return (
    <div className={`glass-card transition-all duration-200 ${learning.isStale ? 'opacity-40' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-accent/30 rounded-xl transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            <TypeBadge type={learning.memoryType} />
            {learning.isStale && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide uppercase bg-muted text-muted-foreground">
                stale
              </span>
            )}
            {learning.period && (
              <span className="text-[11px] text-muted-foreground/70 mono">{learning.period}</span>
            )}
          </div>
          <p className="text-[13px] text-foreground/90 leading-relaxed">{learning.description}</p>
          <p className="text-[11px] text-muted-foreground/50 mt-1.5">
            Updated {formatDate(learning.updatedAt)} &middot; ID: {learning.id}
          </p>
        </div>
        <div className="pt-1 text-muted-foreground/40">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4">
          <div className="bg-background/60 border border-border/40 rounded-lg p-5 prose-learnings">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {learning.content}
            </ReactMarkdown>
          </div>

          <div className="flex items-center justify-end gap-2 mt-3">
            {confirming === 'stale' ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">Mark as stale?</span>
                <button
                  onClick={() => { onMarkStale(learning.id); setConfirming(null); }}
                  className="text-[12px] px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="text-[12px] px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : confirming === 'delete' ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">Delete permanently?</span>
                <button
                  onClick={() => { onDelete(learning.id); setConfirming(null); }}
                  className="text-[12px] px-2.5 py-1 rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirming(null)}
                  className="text-[12px] px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {!learning.isStale && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirming('stale'); }}
                    className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    <Archive className="h-3 w-3" /> Mark Stale
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirming('delete'); }}
                  className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ALL_TYPES = ['profile', 'budget', 'pattern', 'rule', 'fact', 'anomaly', 'recommendation', 'goal'];

export function Learnings() {
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  const load = () => {
    setLoading(true);
    api.getLearnings()
      .then(setLearnings)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleMarkStale = async (id: string) => {
    await api.markLearningStale(id);
    load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteLearning(id);
    load();
  };

  const filtered = learnings.filter((l) => {
    if (statusFilter === 'active' && l.isStale) return false;
    if (statusFilter === 'stale' && !l.isStale) return false;
    if (typeFilter !== 'all' && l.memoryType !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.description.toLowerCase().includes(q) || l.memoryType.includes(q);
    }
    return true;
  });

  const typeCounts = learnings.reduce<Record<string, number>>((acc, l) => {
    if (statusFilter === 'active' && l.isStale) return acc;
    if (statusFilter === 'stale' && !l.isStale) return acc;
    acc[l.memoryType] = (acc[l.memoryType] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted/50 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 glass-card animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Learnings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Financial memories accumulated by the AI agent across conversations
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search descriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card/80 border border-border/60 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-card/80 border border-border/60 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 appearance-none cursor-pointer"
        >
          <option value="all">All types ({learnings.filter(l => statusFilter === 'active' ? !l.isStale : statusFilter === 'stale' ? l.isStale : true).length})</option>
          {ALL_TYPES.filter(t => typeCounts[t]).map(t => (
            <option key={t} value={t}>{t} ({typeCounts[t]})</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-card/80 border border-border/60 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 appearance-none cursor-pointer"
        >
          <option value="active">Active</option>
          <option value="stale">Stale</option>
          <option value="all">All</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Brain className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {learnings.length === 0
              ? 'No learnings yet. Use the financial skills (/snapshot, /monthly-report) to start building memory.'
              : 'No learnings match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => (
            <LearningCard
              key={l.id}
              learning={l}
              onMarkStale={handleMarkStale}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
