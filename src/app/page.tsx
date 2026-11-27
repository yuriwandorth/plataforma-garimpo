'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth';
import { Spinner } from '@/components/ui';

export default function Home() {
  const { loading, user, profile } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(!user ? '/login/' : !profile ? '/onboarding/' : '/painel/');
  }, [loading, user, profile, router]);
  return <Spinner />;
}
