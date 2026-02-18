import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Clock, Check, X } from 'lucide-react';
import { scaled } from '@/lib/scaled';
import type { ProjectOption } from '@/lib/api-types';

export function ProjectPicker({
  selected,
  onSelect,
  onClose,
  projects,
}: {
  selected: ProjectOption | null;
  onSelect: (project: ProjectOption | null) => void;
  onClose: () => void;
  projects: ProjectOption[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [recentIds] = useState<string[]>(() => {
    const first = projects.slice(0, 2).map((p) => p.id);
    return first;
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Group projects by client
  const grouped = (() => {
    const map = new Map<string, ProjectOption[]>();
    for (const p of projects) {
      const client = p.clientName || 'No Client';
      if (!map.has(client)) map.set(client, []);
      map.get(client)!.push(p);
    }
    return Array.from(map.entries()).map(([client, projs]) => ({ client, projects: projs }));
  })();

  const recentProjects = recentIds
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is ProjectOption => p != null);

  const filtered = search
    ? grouped
        .map((g) => ({
          ...g,
          projects: g.projects.filter(
            (p) =>
              p.name.toLowerCase().includes(search.toLowerCase()) ||
              g.client.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((g) => g.projects.length > 0)
    : [
        ...(recentProjects.length > 0 ? [{ client: 'Recent', projects: recentProjects }] : []),
        ...grouped,
      ];

  return (
    <motion.div
      ref={ref}
      className="absolute left-0 top-full z-50 overflow-hidden rounded-lg border border-border bg-background"
      style={{
        width: scaled(260),
        marginTop: scaled(4),
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.15 }}
    >
      {/* Search */}
      <div className="border-b border-border" style={{ padding: scaled(8) }}>
        <div className="relative">
          <Search
            className="absolute text-muted-foreground"
            style={{
              width: scaled(12),
              height: scaled(12),
              left: scaled(8),
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
          <motion.input
            ref={searchRef}
            className="w-full rounded-md border border-border bg-muted/40 text-foreground outline-none placeholder:text-muted-foreground"
            style={{
              height: scaled(28),
              paddingLeft: scaled(26),
              paddingRight: scaled(8),
              fontSize: scaled(11),
            }}
            whileFocus={{ borderColor: 'hsl(var(--primary) / 0.5)' }}
            transition={{ duration: 0.2 }}
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Project list */}
      <div style={{ maxHeight: scaled(180), overflowY: 'auto', padding: `${scaled(4)} 0` }}>
        {filtered.length === 0 ? (
          <div
            className="text-center text-muted-foreground"
            style={{ padding: `${scaled(12)} ${scaled(8)}`, fontSize: scaled(11) }}
          >
            No projects match &ldquo;{search}&rdquo;
          </div>
        ) : (
          filtered.map((group, gi) => (
            <div key={group.client}>
              <div
                className="flex items-center font-brand uppercase tracking-widest text-muted-foreground"
                style={{
                  fontSize: scaled(8),
                  letterSpacing: '1.5px',
                  padding: `${scaled(8)} ${scaled(12)} ${scaled(3)}`,
                  gap: scaled(4),
                  opacity: 0.6,
                }}
              >
                {group.client === 'Recent' && (
                  <Clock style={{ width: scaled(9), height: scaled(9) }} />
                )}
                {group.client}
              </div>
              {group.projects.map((project, pi) => {
                const isSelected = selected?.id === project.id;
                return (
                  <motion.button
                    key={`${group.client}-${project.id}`}
                    className={`flex w-full items-center text-left transition-colors ${
                      isSelected
                        ? 'bg-primary/8 text-foreground'
                        : 'text-foreground/80 hover:bg-muted/50 hover:text-foreground'
                    }`}
                    style={{ gap: scaled(8), padding: `${scaled(6)} ${scaled(12)}` }}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: gi * 0.05 + pi * 0.03, duration: 0.15 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onSelect(project);
                      onClose();
                    }}
                  >
                    <motion.div
                      className="shrink-0 rounded-full"
                      style={{
                        width: scaled(8),
                        height: scaled(8),
                        background: project.color ?? 'hsl(var(--primary))',
                      }}
                      animate={isSelected ? { scale: [1, 1.3, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate" style={{ fontSize: scaled(12) }}>
                        {project.name}
                      </div>
                      {project.clientName && (
                        <div
                          className="truncate text-muted-foreground"
                          style={{ fontSize: scaled(10) }}
                        >
                          {project.clientName}
                        </div>
                      )}
                    </div>
                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                        >
                          <Check
                            className="shrink-0 text-primary"
                            style={{ width: scaled(14), height: scaled(14) }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* No project option */}
      <div className="border-t border-border" style={{ padding: scaled(4) }}>
        <motion.button
          className="flex w-full items-center text-left text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          style={{ gap: scaled(8), padding: `${scaled(6)} ${scaled(12)}`, fontSize: scaled(11) }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            onSelect(null);
            onClose();
          }}
        >
          <X style={{ width: scaled(10), height: scaled(10) }} />
          No project
        </motion.button>
      </div>
    </motion.div>
  );
}
