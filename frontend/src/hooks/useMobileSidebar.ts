import { useState } from 'react'

export function useMobileSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return {
    sidebarOpen,
    openSidebar: () => setSidebarOpen(true),
    closeSidebar: () => setSidebarOpen(false),
  }
}
