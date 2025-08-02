import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const useAccessControl = (requiredPath) => {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = () => {
      try {
        const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
        if (!userId) {
          router.push('/login');
          return;
        }

        const membersData = require('../../data/members.json');
        const user = membersData.members.find(member => member.id === userId);
        
        if (!user || !user.active || !user.urlAccess.includes(requiredPath)) {
          alert("You don't have access Please Payment Once Complete After Access.");
          router.push('/');
          return;
        }
        
        setHasAccess(true);
      } catch (error) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [router, requiredPath]);

  return { hasAccess, loading };
};