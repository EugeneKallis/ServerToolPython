import { useState, useEffect } from 'react';

export function useAgentCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/agent/count');
        if (res.ok) {
          const data = await res.json();
          setCount(data.count);
        }
      } catch {
        // Network error: keep previous value silently
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, []);

  return count;
}
