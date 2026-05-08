import { useCallback, useState } from 'react';

export function useApi<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (request: () => Promise<T>) => {
    setLoading(true);
    setError('');

    try {
      const result = await request();
      setData(result);
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Request gagal';
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    data,
    error,
    loading,
    run,
  };
}
