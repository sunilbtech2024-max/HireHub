const dashboardPaths = {
  student: "/dashboard",
  company: "/company/dashboard",
  admin: "/admin/dashboard",
};

export const dashboardPathForRole = (role) => dashboardPaths[role] || "/account";
