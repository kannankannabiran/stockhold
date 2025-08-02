export const useNavbarAccess = () => {
  const hasAccess = (path) => {
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
      alert(userId);
      if (!userId) return false;
      
      const membersData = require('../../data/members.json');
      const currentUser = membersData.members.find(member => member.id === userId);
      
      if (!currentUser || !currentUser.active) return false;
      return currentUser.urlAccess.includes(path);
    } catch (error) {
      return false;
    }
  };

  return { hasAccess };
};