export const useNavbarAccess = () => {
  const hasAccess = async (path) => {
    const PROTECTED_PATHS = [
      "/chart",
      "/longterm", 
      "/stocklist",
      "/backtest",
      "/options",
      "/trendingoi",
      "/openhighnifty",
      "/herozero",
      "/individual",
    ];

    if (!PROTECTED_PATHS.includes(path)) return true;
    
    try {
      const userId = localStorage.getItem('userId') || sessionStorage.getItem('userId');
      if (!userId) return false;
      
      const response = await fetch('/api/members?userId=' + userId);
      const { members } = await response.json();
      const currentUser = members.find(member => member.id === userId);
      
      if (!currentUser || !currentUser.active) return false;
      return currentUser.urlAccess.includes(path);
    } catch (error) {
      return false;
    }
  };

  return { hasAccess };
};