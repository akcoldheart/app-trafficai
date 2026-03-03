import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  IconSearch,
  IconChevronRight,
  IconChevronDown,
  IconX,
  IconFilter,
  IconInfoCircle,
} from '@tabler/icons-react';
import { taxonomyIndex } from '@/data/taxonomy-index';

interface TaxonomyDetail {
  description: string;
  keywords: string;
  type: string;
}

interface IntentFiltersCardProps {
  selectedPremades: string[];
  onSelectedChange: (premades: string[]) => void;
}

const INITIAL_SHOW = 50;

export default function IntentFiltersCard({
  selectedPremades,
  onSelectedChange,
}: IntentFiltersCardProps) {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubCategories, setExpandedSubCategories] = useState<Set<string>>(new Set());
  const [showAllMap, setShowAllMap] = useState<Set<string>>(new Set());
  const [hoveredPremade, setHoveredPremade] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, TaxonomyDetail> | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const detailsFetched = useRef(false);

  // Fetch details JSON lazily on first hover/select
  const fetchDetails = useCallback(() => {
    if (detailsFetched.current || details) return;
    detailsFetched.current = true;
    setDetailsLoading(true);
    fetch('/data/taxonomy-details.json')
      .then((r) => r.json())
      .then((data) => {
        setDetails(data);
        setDetailsLoading(false);
      })
      .catch(() => setDetailsLoading(false));
  }, [details]);

  // Build category list from index
  const categories = useMemo(() => Object.keys(taxonomyIndex).sort(), []);

  // Filtered tree based on search
  const filteredTree = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return null; // null means "show everything unfiltered"

    const result: Record<string, Record<string, string[]>> = {};

    for (const cat of categories) {
      const subs = taxonomyIndex[cat];
      for (const sub of Object.keys(subs)) {
        const matchingPremades = subs[sub].filter((p) => p.toLowerCase().includes(q));
        if (matchingPremades.length > 0) {
          if (!result[cat]) result[cat] = {};
          result[cat][sub] = matchingPremades;
        }
      }
    }
    return result;
  }, [search, categories]);

  // When search is active, auto-expand matching categories/subs
  useEffect(() => {
    if (filteredTree) {
      setExpandedCategories(new Set(Object.keys(filteredTree)));
      const subs = new Set<string>();
      for (const cat of Object.keys(filteredTree)) {
        for (const sub of Object.keys(filteredTree[cat])) {
          subs.add(`${cat}|${sub}`);
        }
      }
      setExpandedSubCategories(subs);
    }
  }, [filteredTree]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleSubCategory = (key: string) => {
    setExpandedSubCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePremade = (key: string) => {
    fetchDetails();
    if (selectedPremades.includes(key)) {
      onSelectedChange(selectedPremades.filter((k) => k !== key));
    } else {
      onSelectedChange([...selectedPremades, key]);
    }
  };

  const removePremade = (key: string) => {
    onSelectedChange(selectedPremades.filter((k) => k !== key));
  };

  const handleHover = (key: string | null) => {
    if (key) fetchDetails();
    setHoveredPremade(key);
  };

  // Get detail for the hovered or last selected premade
  const activeKey = hoveredPremade || (selectedPremades.length > 0 ? selectedPremades[selectedPremades.length - 1] : null);
  const activeDetail = activeKey && details ? details[activeKey] : null;

  const displayTree = filteredTree ?? taxonomyIndex;
  const displayCategories = Object.keys(displayTree).sort();

  // Count total matched premades for search feedback
  const matchCount = filteredTree
    ? Object.values(filteredTree).reduce(
        (sum, subs) => sum + Object.values(subs).reduce((s, p) => s + p.length, 0),
        0,
      )
    : null;

  return (
    <div className="card">
      <div className="card-header">
        <div className="d-flex align-items-center gap-2">
          <IconFilter size={18} />
          <h3 className="card-title mb-0">Intent Filters</h3>
          {selectedPremades.length > 0 && (
            <span className="badge bg-primary ms-auto">{selectedPremades.length} selected</span>
          )}
        </div>
      </div>
      <div className="card-body p-0">
        <div className="row g-0">
          {/* Left Panel: Search + Tree */}
          <div className="col-md-7" style={{ borderRight: '1px solid var(--tblr-border-color)' }}>
            {/* Search */}
            <div className="p-3" style={{ borderBottom: '1px solid var(--tblr-border-color)' }}>
              <div className="input-icon">
                <span className="input-icon-addon">
                  <IconSearch size={16} />
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search premades..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <span
                    className="input-icon-addon"
                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                    onClick={() => setSearch('')}
                  >
                    <IconX size={14} />
                  </span>
                )}
              </div>
              {matchCount !== null && (
                <small className="text-muted mt-1 d-block">
                  {matchCount} premade{matchCount !== 1 ? 's' : ''} found
                </small>
              )}
            </div>

            {/* Tree */}
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {displayCategories.length === 0 ? (
                <div className="p-3 text-muted text-center">No results found</div>
              ) : (
                displayCategories.map((cat) => {
                  const isExpanded = expandedCategories.has(cat);
                  const subs = displayTree[cat];
                  const subKeys = Object.keys(subs).sort();

                  return (
                    <div key={cat}>
                      {/* Category header */}
                      <div
                        onClick={() => toggleCategory(cat)}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--tblr-border-color)',
                          backgroundColor: 'var(--tblr-bg-surface-secondary)',
                          fontWeight: 600,
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          userSelect: 'none',
                        }}
                      >
                        {isExpanded ? (
                          <IconChevronDown size={14} />
                        ) : (
                          <IconChevronRight size={14} />
                        )}
                        {cat}
                        <span
                          className="badge bg-secondary ms-auto"
                          style={{ fontSize: '10px', fontWeight: 500 }}
                        >
                          {subKeys.length}
                        </span>
                      </div>

                      {/* Subcategories */}
                      {isExpanded &&
                        subKeys.map((sub) => {
                          const subKey = `${cat}|${sub}`;
                          const isSubExpanded = expandedSubCategories.has(subKey);
                          const premades = subs[sub];
                          const showAll = showAllMap.has(subKey);
                          const visiblePremades =
                            !showAll && premades.length > INITIAL_SHOW
                              ? premades.slice(0, INITIAL_SHOW)
                              : premades;

                          return (
                            <div key={subKey}>
                              {/* Subcategory header */}
                              <div
                                onClick={() => toggleSubCategory(subKey)}
                                style={{
                                  padding: '6px 12px 6px 28px',
                                  cursor: 'pointer',
                                  borderBottom: '1px solid var(--tblr-border-color)',
                                  fontSize: '12.5px',
                                  fontWeight: 500,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  userSelect: 'none',
                                }}
                              >
                                {isSubExpanded ? (
                                  <IconChevronDown size={12} />
                                ) : (
                                  <IconChevronRight size={12} />
                                )}
                                <span style={{ flex: 1 }}>{sub}</span>
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 500,
                                    backgroundColor: 'rgba(32, 107, 196, 0.1)',
                                    color: 'var(--tblr-primary)',
                                  }}
                                >
                                  {premades.length}
                                </span>
                              </div>

                              {/* Premade items */}
                              {isSubExpanded &&
                                visiblePremades.map((premade) => {
                                  const premadeKey = `${cat}|${sub}|${premade}`;
                                  const isSelected = selectedPremades.includes(premadeKey);

                                  return (
                                    <div
                                      key={premadeKey}
                                      onClick={() => togglePremade(premadeKey)}
                                      onMouseEnter={() => handleHover(premadeKey)}
                                      onMouseLeave={() => handleHover(null)}
                                      style={{
                                        padding: '5px 12px 5px 48px',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid var(--tblr-border-color)',
                                        fontSize: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        backgroundColor: isSelected
                                          ? 'rgba(32, 107, 196, 0.08)'
                                          : hoveredPremade === premadeKey
                                            ? 'rgba(255,255,255,0.03)'
                                            : 'transparent',
                                        transition: 'background-color 0.1s',
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={isSelected}
                                        onChange={() => {}}
                                        style={{ margin: 0, flexShrink: 0 }}
                                      />
                                      <span style={{ flex: 1 }}>{premade}</span>
                                    </div>
                                  );
                                })}

                              {/* Show all button */}
                              {isSubExpanded &&
                                !showAll &&
                                premades.length > INITIAL_SHOW && (
                                  <div
                                    onClick={() =>
                                      setShowAllMap((prev) => {
                                        const next = new Set(prev);
                                        next.add(subKey);
                                        return next;
                                      })
                                    }
                                    style={{
                                      padding: '6px 12px 6px 48px',
                                      cursor: 'pointer',
                                      borderBottom: '1px solid var(--tblr-border-color)',
                                      fontSize: '12px',
                                      color: 'var(--tblr-primary)',
                                      fontWeight: 500,
                                    }}
                                  >
                                    Show all {premades.length} premades
                                  </div>
                                )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Detail View */}
          <div className="col-md-5">
            <div
              style={{
                position: 'sticky',
                top: 0,
                padding: '16px',
                minHeight: '200px',
              }}
            >
              {activeDetail ? (
                <>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <h4
                      className="mb-0"
                      style={{ fontSize: '14px', fontWeight: 600 }}
                    >
                      {activeKey!.split('|')[2]}
                    </h4>
                    {activeDetail.type && (
                      <span
                        className="badge"
                        style={{
                          fontSize: '10px',
                          backgroundColor:
                            activeDetail.type === 'B2B'
                              ? 'rgba(32, 107, 196, 0.15)'
                              : 'rgba(32, 196, 140, 0.15)',
                          color:
                            activeDetail.type === 'B2B' ? '#4299e1' : '#20c997',
                        }}
                      >
                        {activeDetail.type}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-muted mb-3"
                    style={{ fontSize: '12px', lineHeight: 1.5 }}
                  >
                    {activeDetail.description}
                  </p>
                  {activeDetail.keywords && (
                    <>
                      <div
                        className="text-muted mb-2"
                        style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
                      >
                        Keywords
                      </div>
                      <div className="d-flex flex-wrap gap-1">
                        {activeDetail.keywords
                          .split(',')
                          .slice(0, 15)
                          .map((kw, i) => (
                            <span
                              key={i}
                              className="badge"
                              style={{
                                fontSize: '10px',
                                fontWeight: 400,
                                backgroundColor: 'var(--tblr-bg-surface-secondary)',
                                color: 'var(--tblr-body-color)',
                              }}
                            >
                              {kw.trim()}
                            </span>
                          ))}
                      </div>
                    </>
                  )}
                </>
              ) : detailsLoading ? (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                  <span className="spinner-border spinner-border-sm me-2" />
                  Loading details...
                </div>
              ) : (
                <div
                  className="d-flex flex-column align-items-center justify-content-center text-muted"
                  style={{ height: '200px' }}
                >
                  <IconInfoCircle size={32} className="mb-2" style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: '13px' }}>
                    Hover or select a premade to see details
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selected chips */}
        {selectedPremades.length > 0 && (
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--tblr-border-color)',
            }}
          >
            <div
              className="text-muted mb-2"
              style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
            >
              Selected ({selectedPremades.length})
            </div>
            <div className="d-flex flex-wrap gap-1">
              {selectedPremades.map((key) => (
                <span
                  key={key}
                  className="badge d-inline-flex align-items-center gap-1"
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    backgroundColor: 'rgba(32, 107, 196, 0.1)',
                    color: 'var(--tblr-primary)',
                    padding: '4px 8px',
                    cursor: 'pointer',
                  }}
                  onClick={() => removePremade(key)}
                  title={key.split('|').slice(0, 2).join(' > ')}
                >
                  {key.split('|')[2]}
                  <IconX size={12} />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
