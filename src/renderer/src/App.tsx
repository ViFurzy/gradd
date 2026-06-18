import React, { useEffect, useState, useRef } from 'react'
import {
  ArrowsLeftRight,
  Chats,
  InstagramLogo,
  ChatTeardropText,
  Gear,
  Trash,
  Moon,
  Cloud,
  Desktop,
  SpeakerHigh,
  SpeakerSlash,
  ArrowClockwise,
  Check,
  FloppyDisk
} from '@phosphor-icons/react'
import { useLayoutStore } from './store/useLayoutStore'

import messengerLogo from './assets/messenger.svg'
import whatsappLogo from './assets/whatsapp.svg'
import telegramLogo from './assets/telegram.svg'
import slackLogo from './assets/slack.svg'
import instagramLogo from './assets/instagram.png'
import gadugaduLogo from './assets/gadugadu.svg'
import logoImg from './assets/logo.png'

function App(): React.JSX.Element {
  const {
    layoutMode,
    setLayoutMode,
    services,
    activeServiceId,
    activePanel,
    selectService,
    showDirectory,
    showSettings,
    initialize,
    setServiceUnreadCount,
    isDndActive,
    setDndActiveState,
    reorderServices,
    authState,
    logoutGoogle
  } = useLayoutStore()
  const [hoveredToggle, setHoveredToggle] = useState(false)
  const [draggedServiceId, setDraggedServiceId] = useState<string | null>(null)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.onProfileMenuAction((action) => {
      if (action === 'settings') {
        showSettings()
      } else if (action === 'logout') {
        handleLogout()
      }
    })
  }, [showSettings])

  const handleLogout = async () => {
    const clearSetup = window.confirm(
      'You are about to log out.\n\nDo you want to CLEAR your local setup/data? Press OK to clear everything and reset to default, or Cancel to keep your settings.'
    )
    if (clearSetup) {
      await window.api.clearConfig()
    } else {
      await logoutGoogle()
    }
  }

  const totalUnreadCount = services
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + (s.unreadCount || 0), 0)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Listen for unread count updates from Electron main process
  useEffect(() => {
    window.api.onUnreadCountsUpdated((data) => {
      setServiceUnreadCount(data.serviceId, data.count)
    })
  }, [setServiceUnreadCount])

  // Listen for DND status changes from Electron main process
  useEffect(() => {
    window.api.onDndStatusChanged((active) => {
      setDndActiveState(active)
    })
  }, [setDndActiveState])

  // Listen for services list updates from Electron main process (e.g. from context menus)
  useEffect(() => {
    window.api.onServicesUpdated((updatedServices) => {
      const currentServices = useLayoutStore.getState().services
      const merged = updatedServices.map((updated) => {
        const existing = currentServices.find((s) => s.id === updated.id)
        return {
          ...updated,
          unreadCount: existing ? existing.unreadCount : 0
        }
      })
      useLayoutStore.setState({ services: merged })
    })
  }, [])

  // Update Windows taskbar badge icon whenever total unread count changes
  useEffect(() => {
    if (totalUnreadCount === 0) {
      window.api.updateTaskbarBadge(null, 'No unread messages')
    } else {
      // Create offscreen canvas to draw numeric overlay badge
      const canvas = document.createElement('canvas')
      canvas.width = 16
      canvas.height = 16
      const ctx = canvas.getContext('2d')
      
      if (ctx) {
        // Red badge background circle
        ctx.fillStyle = '#e5534b'
        ctx.beginPath()
        ctx.arc(8, 8, 8, 0, Math.PI * 2)
        ctx.fill()

        // White text formatting
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 9px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const text = totalUnreadCount > 9 ? '9+' : String(totalUnreadCount)
        ctx.fillText(text, 8, 8.5) // Slightly offset vertically for visual centering

        const dataUrl = canvas.toDataURL('image/png')
        window.api.updateTaskbarBadge(dataUrl, `${totalUnreadCount} unread messages`)
      }
    }
  }, [services, totalUnreadCount])

  // Synchronize boundaries of the React container with the Electron WebContentsView
  useEffect(() => {
    if (!contentRef.current) return

    const updateBounds = (): void => {
      if (!contentRef.current) return
      const rect = contentRef.current.getBoundingClientRect()
      window.api.updateViewBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }

    // Run immediately to capture layout mount bounds
    updateBounds()

    // Trigger bounds updates on container resizes
    const observer = new ResizeObserver(() => {
      updateBounds()
    })
    observer.observe(contentRef.current)

    // Trigger bounds updates on window resize
    window.addEventListener('resize', updateBounds)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateBounds)
    }
  }, [layoutMode, activeServiceId, activePanel])

  const toggleLayout = (): void => {
    setLayoutMode(layoutMode === 'sidebar' ? 'tabs' : 'sidebar')
  }

  const getServiceIcon = (type: string): React.JSX.Element => {
    switch (type) {
      case 'whatsapp':
        return <img src={whatsappLogo} className="w-5 h-5 object-contain" alt="WhatsApp" />
      case 'telegram':
        return <img src={telegramLogo} className="w-5 h-5 object-contain" alt="Telegram" />
      case 'messenger':
        return <img src={messengerLogo} className="w-5 h-5 object-contain" alt="Messenger" />
      case 'slack':
        return <img src={slackLogo} className="w-5 h-5 object-contain" alt="Slack" />
      case 'instagram':
        return <img src={instagramLogo} className="w-5 h-5 object-contain" alt="Instagram" />
      case 'gadugadu':
        return <img src={gadugaduLogo} className="w-5 h-5 object-contain" alt="Gadu-Gadu" />
      default:
        return <Chats size={20} weight="bold" />
    }
  }

  const enabledServices = services.filter((s) => s.enabled)

  return (
    <div className="w-screen h-screen flex flex-col select-none bg-dominant text-text-primary">
      {/* 32px custom titlebar drag region */}
      <header
        onDoubleClick={() => window.api.doubleClickHeader()}
        className="h-8 min-h-8 bg-secondary border-b border-surface-border flex items-center justify-between px-4 drag"
      >
        <div className="flex items-center gap-2">
          <img src={logoImg} className="w-3.5 h-3.5 scale-110 object-contain select-none pointer-events-none" alt="" />
          <span className="text-[11px] font-semibold text-text-muted leading-[1.3]">Gradd</span>
          {isDndActive && (
            <div className="flex items-center gap-1 bg-accent/20 border border-accent/30 text-accent px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold tracking-wide animate-pulse">
              <Moon size={10} weight="fill" />
              <span>DND</span>
            </div>
          )}
          {totalUnreadCount > 0 && (
            <div className="flex items-center gap-1 bg-destructive/20 border border-destructive/30 text-[#e5534b] px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold tracking-wide animate-pulse select-none">
              <span>{totalUnreadCount} UNREAD</span>
            </div>
          )}
        </div>
        {/* Reservation for native Windows control overlay on the right */}
        <div className="w-[140px]" />
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {layoutMode === 'sidebar' ? (
          <>
            {/* Left Sidebar Layout */}
            <aside className="w-14 min-w-14 bg-secondary border-r border-surface-border flex flex-col justify-between items-center py-4">
              {/* Top Section - Logo & Service list icons */}
              <div className="flex flex-col gap-2 w-full items-center">
                {/* Gradd Logo Button / Directory Trigger */}
                <button
                  onClick={showDirectory}
                  className={`no-drag relative w-14 h-12 flex items-center justify-center text-accent hover:bg-hover-surface transition-all duration-150 cursor-pointer ${
                    activePanel === 'directory' ? 'bg-active-surface' : 'bg-transparent'
                  }`}
                  title="Services Directory"
                >
                  {/* Active indicator strip for directory */}
                  {activePanel === 'directory' && (
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent rounded-r-[2px]" />
                  )}
                  <img
                    src={logoImg}
                    className="w-5.5 h-5.5 scale-110 object-contain select-none pointer-events-none"
                    alt=""
                  />
                </button>

                {/* Sidebar Separator line */}
                <div className="w-8 h-[1px] bg-surface-border my-1" />

                {enabledServices.map((service, index) => {
                  const isActive = activeServiceId === service.id && activePanel === 'service'
                  const isDragged = draggedServiceId === service.id
                  return (
                    <React.Fragment key={service.id}>
                      <button
                        onClick={() => selectService(service.id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          window.api.showServiceContextMenu(service.id)
                        }}
                        draggable="true"
                        onDragStart={() => setDraggedServiceId(service.id)}
                        onDragEnd={() => setDraggedServiceId(null)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (draggedServiceId === null || draggedServiceId === service.id) return
                          
                          const draggedIdx = enabledServices.findIndex((s) => s.id === draggedServiceId)
                          const hoverIdx = index
                          if (draggedIdx === -1) return
                          
                          const updated = [...enabledServices]
                          const [draggedItem] = updated.splice(draggedIdx, 1)
                          updated.splice(hoverIdx, 0, draggedItem)
                          
                          reorderServices(updated)
                        }}
                        className={`no-drag relative w-14 h-11 flex items-center justify-center transition-all duration-150 cursor-grab active:cursor-grabbing ${
                          isActive
                            ? 'bg-active-surface text-icon-active'
                            : 'bg-transparent text-icon-default hover:bg-hover-surface hover:text-icon-active'
                        } ${isDragged ? 'opacity-30 scale-95 bg-active-surface/30' : ''}`}
                        title={service.name}
                      >
                        {/* Active indicator strip */}
                        {isActive && (
                          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent rounded-r-[2px]" />
                        )}
                        {getServiceIcon(service.type)}
                        {/* Unread badge */}
                        {service.unreadCount && service.unreadCount > 0 ? (
                          <div className="absolute top-1.5 right-2 min-w-[15px] h-3.5 bg-destructive text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 shadow border border-secondary leading-none select-none">
                            {service.unreadCount}
                          </div>
                        ) : null}
                        {/* Mute indicator */}
                        {service.muted ? (
                          <div className="absolute bottom-1.5 right-2 text-[#e5534b] flex items-center justify-center pointer-events-none">
                            <SpeakerSlash size={11} weight="bold" />
                          </div>
                        ) : null}
                      </button>
                      {/* Invisible Spacer */}
                      <div className="w-full h-1" />
                      {index < enabledServices.length - 1 && (
                        <div className="w-6 h-px bg-white/5 my-0.5 pointer-events-none" />
                      )}
                    </React.Fragment>
                  )
                })}
              </div>

              {/* Bottom Section - Layout Toggle & Settings Gear */}
              <div className="flex flex-col gap-3 items-center w-full relative">
                {isDndActive && (
                  <div
                    className="w-11 h-11 flex items-center justify-center text-accent animate-pulse"
                    title="Do Not Disturb is Active"
                  >
                    <Moon size={20} weight="fill" />
                  </div>
                )}

                {/* Layout Toggle Button */}
                <div
                  className="relative flex items-center justify-center"
                  onMouseEnter={() => setHoveredToggle(true)}
                  onMouseLeave={() => setHoveredToggle(false)}
                >
                  <button
                    onClick={toggleLayout}
                    aria-label="Switch to Tabs"
                    className="no-drag w-11 h-11 flex items-center justify-center rounded-md hover:bg-hover-surface text-icon-default hover:text-icon-active transition-all duration-150 cursor-pointer"
                  >
                    <ArrowsLeftRight size={20} weight="bold" />
                  </button>
                  {/* Tooltip containing exact copy */}
                  {hoveredToggle && (
                    <div className="absolute left-16 bg-secondary border border-surface-border text-text-primary text-xs font-normal leading-[1.4] px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                      Switch to Tabs
                    </div>
                  )}
                </div>

                {/* Settings Gear Icon Button */}
                <button
                  onClick={showSettings}
                  className={`no-drag w-11 h-11 flex items-center justify-center rounded-md hover:bg-hover-surface transition-all duration-150 cursor-pointer ${
                    activePanel === 'settings'
                      ? 'bg-active-surface text-accent'
                      : 'text-icon-default hover:text-icon-active bg-transparent'
                  }`}
                  title="Settings"
                >
                  <Gear size={20} weight="bold" />
                </button>

                {/* Google Account Profile Picture */}
                {authState.loggedIn && authState.photoURL && (
                  <div className="mt-1 pt-3 pb-2 border-t border-surface-border/50 flex justify-center w-full relative">
                    <button
                      onClick={() => window.api.showProfileMenu()}
                      className="no-drag w-7 h-7 rounded-full overflow-hidden border border-surface-border cursor-pointer hover:border-accent transition-all duration-150"
                      title="Google Account"
                    >
                      <img 
                        src={authState.photoURL} 
                        className="w-full h-full object-cover select-none pointer-events-none" 
                        alt="Google Profile" 
                      />
                    </button>
                  </div>
                )}
              </div>
            </aside>

            {/* Content Area */}
            <main
              ref={contentRef}
              className="flex-1 h-full bg-transparent flex flex-col items-center justify-start overflow-hidden content-area"
            >
              {activePanel === 'directory' ? <DirectoryDashboard /> : null}
              {activePanel === 'settings' ? <SettingsPanel onLogout={handleLogout} /> : null}
            </main>
          </>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Tab Bar Layout */}
            <div className="h-10 min-h-10 bg-secondary border-b border-surface-border flex items-center justify-between px-2 select-none">
              {/* Tabs list */}
              <div className="flex items-center gap-1 overflow-x-auto h-full flex-1 no-scrollbar">
                {/* Directory Logo button on the left */}
                <button
                  onClick={showDirectory}
                  className={`no-drag relative h-full flex items-center justify-center px-4 border-b-2 transition-all duration-150 cursor-pointer ${
                    activePanel === 'directory'
                      ? 'border-accent text-accent bg-active-surface/30'
                      : 'border-transparent text-text-muted hover:bg-hover-surface hover:text-accent'
                  }`}
                  title="Services Directory"
                >
                  <img src={logoImg} className="w-5 h-5 object-contain select-none pointer-events-none" alt="" />
                </button>

                {/* Vertical Separator */}
                <div className="w-[1px] h-5 bg-surface-border mx-1 self-center" />

                {enabledServices.map((service, index) => {
                  const isActive = activeServiceId === service.id && activePanel === 'service'
                  const isDragged = draggedServiceId === service.id
                  return (
                    <React.Fragment key={service.id}>
                      <button
                        onClick={() => selectService(service.id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          window.api.showServiceContextMenu(service.id)
                        }}
                        draggable="true"
                        onDragStart={() => setDraggedServiceId(service.id)}
                        onDragEnd={() => setDraggedServiceId(null)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (draggedServiceId === null || draggedServiceId === service.id) return
                          
                          const draggedIdx = enabledServices.findIndex((s) => s.id === draggedServiceId)
                          const hoverIdx = index
                          if (draggedIdx === -1) return
                          
                          const updated = [...enabledServices]
                          const [draggedItem] = updated.splice(draggedIdx, 1)
                          updated.splice(hoverIdx, 0, draggedItem)
                          
                          reorderServices(updated)
                        }}
                        className={`no-drag relative h-full flex items-center gap-2 px-4 transition-all duration-150 cursor-grab active:cursor-grabbing border-b-2 ${
                          isActive
                            ? 'border-accent text-text-primary bg-active-surface/30'
                            : 'border-transparent text-text-muted hover:bg-hover-surface hover:text-text-primary'
                        } ${isDragged ? 'opacity-30 scale-95 bg-active-surface/30' : ''}`}
                      >
                        <span className="flex items-center text-sm">
                          {getServiceIcon(service.type)}
                        </span>
                        <span className="text-xs font-normal leading-[1.4]">{service.name}</span>
                        {service.muted && (
                          <SpeakerSlash size={12} weight="bold" className="text-[#e5534b] flex-shrink-0" />
                        )}
                        {/* Unread badge */}
                        {service.unreadCount && service.unreadCount > 0 ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-destructive text-white leading-none shadow select-none">
                            {service.unreadCount}
                          </span>
                        ) : null}
                      </button>
                      {index < enabledServices.length - 1 && (
                        <div className="w-px h-5 bg-white/5 mx-0.5 pointer-events-none" />
                      )}
                    </React.Fragment>
                  )
                })}
              </div>

              {/* Top Bar Right controls - Layout Toggle Icon & Settings Icon */}
              <div className="flex items-center gap-1">
                {isDndActive && (
                  <div
                    className="w-8 h-8 flex items-center justify-center text-accent animate-pulse"
                    title="Do Not Disturb is Active"
                  >
                    <Moon size={18} weight="fill" />
                  </div>
                )}

                {/* Layout Toggle Icon Button */}
                <button
                  onClick={toggleLayout}
                  className="no-drag text-text-muted hover:text-text-primary w-8 h-8 flex items-center justify-center transition-all duration-150 rounded hover:bg-hover-surface cursor-pointer"
                  title="Switch to Sidebar"
                >
                  <ArrowsLeftRight size={18} weight="bold" />
                </button>

                {/* Settings Gear Icon Button */}
                <button
                  onClick={showSettings}
                  className={`no-drag w-8 h-8 flex items-center justify-center transition-all duration-150 rounded hover:bg-hover-surface cursor-pointer ${
                    activePanel === 'settings'
                      ? 'bg-active-surface text-accent'
                      : 'text-text-muted hover:text-text-primary bg-transparent'
                  }`}
                  title="Settings"
                >
                  <Gear size={18} weight="bold" />
                </button>

                {/* Google Account Profile Picture */}
                {authState.loggedIn && authState.photoURL && (
                  <div className="ml-1 pl-2 border-l border-surface-border/50 flex items-center h-full relative">
                    <button
                      onClick={() => window.api.showProfileMenu()}
                      className="no-drag w-6 h-6 rounded-full overflow-hidden border border-surface-border cursor-pointer hover:border-accent transition-all duration-150"
                      title="Google Account"
                    >
                      <img 
                        src={authState.photoURL} 
                        className="w-full h-full object-cover select-none pointer-events-none" 
                        alt="Google Profile" 
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Content Area */}
            <main
              ref={contentRef}
              className="flex-1 h-full bg-transparent flex flex-col items-center justify-start overflow-hidden content-area"
            >
              {activePanel === 'directory' ? <DirectoryDashboard /> : null}
              {activePanel === 'settings' ? <SettingsPanel onLogout={handleLogout} /> : null}
            </main>
          </div>
        )}
      </div>
    </div>
  )
}

function DirectoryDashboard(): React.JSX.Element {
  const { services, toggleService, selectService, toggleMuteService, authState, showSettings } = useLayoutStore()
  const [clearingServiceIds, setClearingServiceIds] = useState<Record<string, boolean>>({})

  const handleClearService = async (serviceId: string, name: string): Promise<void> => {
    const confirmed = window.confirm(
      `Are you sure you want to clear all cookies, cache, and session data for ${name}? You will be logged out of this service.`
    )
    if (!confirmed) return

    setClearingServiceIds((prev) => ({ ...prev, [serviceId]: true }))
    try {
      await window.api.clearServiceStorageData(serviceId)
      // Wait a brief moment to show success feedback in the button state
      await new Promise((resolve) => setTimeout(resolve, 800))
    } catch (error) {
      console.error(error)
    } finally {
      setClearingServiceIds((prev) => ({ ...prev, [serviceId]: false }))
    }
  }

  const getDashboardIcon = (type: string): React.JSX.Element => {
    switch (type) {
      case 'whatsapp':
        return <img src={whatsappLogo} className="w-8 h-8 object-contain" alt="WhatsApp" />
      case 'telegram':
        return <img src={telegramLogo} className="w-8 h-8 object-contain" alt="Telegram" />
      case 'messenger':
        return <img src={messengerLogo} className="w-8 h-8 object-contain" alt="Messenger" />
      case 'slack':
        return <img src={slackLogo} className="w-8 h-8 object-contain" alt="Slack" />
      case 'instagram':
        return <img src={instagramLogo} className="w-8 h-8 object-contain" alt="Instagram" />
      case 'gadugadu':
        return <img src={gadugaduLogo} className="w-8 h-8 object-contain" alt="Gadu-Gadu" />
      default:
        return <Chats size={28} weight="bold" className="text-[#006AFF]" />
    }
  }

  return (
    <div className="w-full max-w-4xl px-8 py-6 h-full overflow-y-auto flex flex-col justify-start select-none content-area no-scrollbar">
      <div className="mb-8 border-b border-surface-border pb-4 flex items-center gap-4">
        <img src={logoImg} className="w-12 h-12 object-contain select-none pointer-events-none" alt="" />
        <div>
          <h1 className="text-xl font-semibold text-text-primary leading-[1.2] mb-1">
            Services Directory
          </h1>
          <p className="text-sm font-normal text-text-muted leading-[1.5]">
            Manage your active messaging services. Enabled services will appear in your panel.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!authState.loggedIn ? (
          <div className="col-span-1 md:col-span-2 bg-accent/10 border border-accent/20 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between mb-2 gap-4">
            <div className="flex items-center gap-3">
              <Cloud size={24} weight="bold" className="text-accent flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-accent leading-[1.2]">Enable Cloud Sync</h3>
                <p className="text-xs text-text-muted mt-1 leading-[1.4]">
                  If you want to securely backup your layouts, DND schedules, and settings across devices, just log in via Google!
                </p>
              </div>
            </div>
            <button
              onClick={showSettings}
              className="no-drag whitespace-nowrap px-4 py-2 bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer"
            >
              Go to Settings
            </button>
          </div>
        ) : (
          <div className="col-span-1 md:col-span-2 bg-active-surface/50 border border-surface-border rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between mb-2 gap-4">
            <div className="flex items-center gap-3">
              <Cloud size={24} weight="bold" className="text-accent flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-text-primary leading-[1.2]">Cloud Sync Active</h3>
                <p className="text-xs text-text-muted mt-1 leading-[1.4]">
                  Your settings are currently being backed up and synced to your Google account.
                </p>
              </div>
            </div>
            <button
              onClick={showSettings}
              className="no-drag whitespace-nowrap px-4 py-2 bg-secondary hover:bg-hover-surface text-text-primary border border-surface-border text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer"
            >
              Manage Settings
            </button>
          </div>
        )}
        {services.map((service) => {
          const isEnabled = service.enabled
          const isClearing = clearingServiceIds[service.id]
          return (
            <div
              key={service.id}
              className="bg-secondary border border-surface-border rounded-lg p-4 flex items-center justify-between hover:border-text-muted/30 transition-all duration-150"
            >
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-dominant rounded-md flex items-center justify-center">
                  {getDashboardIcon(service.type)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary leading-[1.2]">
                    {service.name}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isEnabled && (
                  <button
                    onClick={() => selectService(service.id)}
                    className="no-drag px-3 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer"
                  >
                    Open
                  </button>
                )}

                {/* Custom toggle switch */}
                <button
                  onClick={() => toggleService(service.id)}
                  className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                    isEnabled ? 'bg-accent' : 'bg-dominant border border-surface-border'
                  }`}
                  aria-label={`Toggle ${service.name}`}
                >
                  <div
                    className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                      isEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>

                {/* Mute Toggle Button */}
                <button
                  onClick={() => toggleMuteService(service.id)}
                  className="no-drag p-1.5 rounded transition-all duration-150 cursor-pointer focus:outline-none text-text-muted hover:text-accent hover:bg-hover-surface"
                  title={service.muted ? `Unmute ${service.name}` : `Mute ${service.name}`}
                  aria-label={service.muted ? `Unmute ${service.name}` : `Mute ${service.name}`}
                >
                  {service.muted ? (
                    <SpeakerSlash size={16} weight="bold" className="text-[#e5534b]" />
                  ) : (
                    <SpeakerHigh size={16} weight="bold" />
                  )}
                </button>

                {/* Trash/Clear cache button */}
                <button
                  onClick={() => handleClearService(service.id, service.name)}
                  disabled={isClearing}
                  className={`no-drag p-1.5 rounded transition-all duration-150 cursor-pointer focus:outline-none ${
                    isClearing
                      ? 'text-text-muted bg-hover-surface cursor-not-allowed animate-pulse'
                      : 'text-text-muted hover:text-[#e5534b] hover:bg-[#e5534b]/10 bg-transparent'
                  }`}
                  title={`Clear cache & session for ${service.name}`}
                  aria-label={`Clear cache & session for ${service.name}`}
                >
                  <Trash size={16} weight="bold" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SettingsPanel({ onLogout }: { onLogout: () => void }): React.JSX.Element {
  const { layoutMode, setLayoutMode, dndConfig, isDndActive, updateDndConfig, authState, loginGoogle, logoutGoogle, generalConfig, updateGeneralConfig } = useLayoutStore()
  const [clearingState, setClearingState] = useState<'idle' | 'clearing' | 'success'>('idle')
  const [appVersion, setAppVersion] = useState<string>('0.0.0')
  const [checkingState, setCheckingState] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'downloaded' | 'error'>('idle')
  const [updateError, setUpdateError] = useState<string>('')

  useEffect(() => {
    window.api.getAppVersion()
      .then((v) => setAppVersion(v))
      .catch((err) => console.error('Failed to get app version:', err))

    window.api.onUpdateChecking(() => setCheckingState('checking'))
    window.api.onUpdateAvailable(() => setCheckingState('available'))
    window.api.onUpdateNotAvailable(() => {
      setCheckingState('up-to-date')
      setTimeout(() => setCheckingState('idle'), 5000)
    })
    window.api.onUpdateDownloaded(() => setCheckingState('downloaded'))
    window.api.onUpdateError((err) => {
      setCheckingState('error')
      setUpdateError(err)
      setTimeout(() => setCheckingState('idle'), 5000)
    })
  }, [])

  const handleCheckUpdates = (): void => {
    if (checkingState === 'downloaded') {
      window.api.installUpdate()
      return
    }
    setCheckingState('checking')
    window.api.checkForUpdates()
  }

  const handleClearSessions = async (): Promise<void> => {
    setClearingState('clearing')
    try {
      await window.api.clearStorageData()
      setClearingState('success')
      setTimeout(() => setClearingState('idle'), 4000)
    } catch (error) {
      console.error(error)
      setClearingState('idle')
    }
  }

  return (
    <div className="w-full max-w-4xl px-8 py-6 h-full overflow-y-auto flex flex-col justify-start select-none content-area no-scrollbar">
      <div className="mb-8 border-b border-surface-border pb-4 flex items-center gap-4">
        <img src={logoImg} className="w-12 h-12 object-contain select-none pointer-events-none" alt="" />
        <div>
          <h1 className="text-xl font-semibold text-text-primary leading-[1.2] mb-1">Settings</h1>
          <p className="text-sm font-normal text-text-muted leading-[1.5]">
            Configure your Gradd preferences, layouts, and session data.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">


        {/* Section 1: Behavior */}
        <section className="bg-secondary border border-surface-border rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Desktop size={20} weight="bold" className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary leading-[1.2]">
              General Behavior
            </h2>
          </div>

          {/* Close to Tray Toggle */}
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                Keep running in background
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                When enabled, closing the window will minimize Gradd to the system tray. 
                When disabled, closing the window will fully quit the app.
              </p>
            </div>
            <button
              onClick={() => updateGeneralConfig({ closeToTray: !generalConfig?.closeToTray })}
              className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                generalConfig?.closeToTray !== false ? 'bg-accent' : 'bg-dominant border border-surface-border'
              }`}
            >
              <div
                className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                  generalConfig?.closeToTray !== false ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Section 1.5: Cloud Sync */}
        <section className="bg-secondary border border-surface-border rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Cloud size={20} weight="bold" className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary leading-[1.2]">
              Cloud Sync
            </h2>
          </div>
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                Google Account Sync
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                {authState.loggedIn 
                  ? `Signed in. Your layouts and configurations are automatically synced to the cloud.`
                  : `Sign in with Google to sync your service layout, DND configurations, and settings to the cloud.`}
              </p>
            </div>
            <div>
              {authState.loggedIn ? (
                <button
                  onClick={() => onLogout()}
                  className="no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none bg-dominant hover:bg-hover-surface text-text-primary border border-surface-border"
                >
                  Sign Out
                </button>
              ) : (
                <button
                  onClick={() => loginGoogle()}
                  className="no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30"
                >
                  Sign in with Google
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Section 1.6: Local Backup */}
        <section className="bg-secondary border border-surface-border rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <FloppyDisk size={20} weight="bold" className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary leading-[1.2]">
              Local Backup & Restore
            </h2>
          </div>
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                Export / Import Configuration
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                Manually save your exact setup (services, layouts, and DND states) to a local file, or load an existing one.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const res = await window.api.exportConfig();
                  if (res.success) {
                    alert('Configuration exported successfully!');
                  } else if (res.error) {
                    alert('Export failed: ' + res.error);
                  }
                }}
                className="no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none bg-dominant hover:bg-hover-surface text-text-primary border border-surface-border"
              >
                Export Config
              </button>
              <button
                onClick={async () => {
                  const res = await window.api.importConfig();
                  if (res.success) {
                    // App will automatically restart
                  } else if (res.error) {
                    alert('Import failed: ' + res.error);
                  }
                }}
                className="no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30"
              >
                Import Config
              </button>
            </div>
          </div>
        </section>

        {/* Old Cache section removed here */}

        {/* Section 3: Do Not Disturb */}
        <section className={`bg-secondary border rounded-lg p-5 flex flex-col gap-4 transition-all duration-150 ${
          isDndActive ? 'border-accent/30' : 'border-surface-border'
        }`}>
          <div className="flex items-center gap-3">
            <Moon size={20} weight={isDndActive ? "fill" : "bold"} className={isDndActive ? "text-accent animate-pulse" : "text-text-muted"} />
            <h2 className="text-sm font-semibold text-text-primary leading-[1.2]">
              Do Not Disturb (DND)
            </h2>
            {isDndActive && (
              <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded uppercase border border-accent/20 font-bold tracking-wide animate-pulse">
                Active
              </span>
            )}
          </div>

          <div className="border-t border-surface-border/50 pt-4 flex flex-col gap-5">
            {/* Manual Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">Enable Do Not Disturb</h3>
                <p className="text-xs text-text-muted mt-1 leading-[1.4]">
                  Mute all service sounds and block native desktop notifications immediately.
                </p>
              </div>
              <button
                onClick={() => updateDndConfig({ manualActive: !dndConfig.manualActive })}
                className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                  dndConfig.manualActive ? 'bg-accent' : 'bg-dominant border border-surface-border'
                }`}
                aria-label="Toggle Manual DND"
              >
                <div
                  className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                    dndConfig.manualActive ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Schedule Enable Toggle */}
            <div className="flex items-center justify-between border-t border-surface-border/30 pt-4">
              <div>
                <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">Recurring DND Schedule</h3>
                <p className="text-xs text-text-muted mt-1 leading-[1.4]">
                  Automatically activate Do Not Disturb during specific hours.
                </p>
              </div>
              <button
                onClick={() => updateDndConfig({ scheduleEnabled: !dndConfig.scheduleEnabled })}
                className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                  dndConfig.scheduleEnabled ? 'bg-accent' : 'bg-dominant border border-surface-border'
                }`}
                aria-label="Toggle DND Schedule"
              >
                <div
                  className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                    dndConfig.scheduleEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Time Settings */}
            {dndConfig.scheduleEnabled && (
              <div className="flex flex-col sm:flex-row gap-4 border-t border-surface-border/30 pt-4">
                <div className="flex-1 flex flex-col gap-1.5">
                  <label htmlFor="dnd-start-time" className="text-[11px] font-semibold text-text-muted">Start Time</label>
                  <input
                    id="dnd-start-time"
                    type="time"
                    value={dndConfig.startTime}
                    onChange={(e) => updateDndConfig({ startTime: e.target.value })}
                    className="no-drag bg-dominant border border-surface-border rounded px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent w-full cursor-pointer"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label htmlFor="dnd-end-time" className="text-[11px] font-semibold text-text-muted">End Time</label>
                  <input
                    id="dnd-end-time"
                    type="time"
                    value={dndConfig.endTime}
                    onChange={(e) => updateDndConfig({ endTime: e.target.value })}
                    className="no-drag bg-dominant border border-surface-border rounded px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent w-full cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Cache & Session Management */}
        <section className="bg-secondary border border-surface-border rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Trash size={20} weight="bold" className="text-[#e5534b]" />
            <h2 className="text-sm font-semibold text-text-primary leading-[1.2]">
              Cache & Session Management
            </h2>
          </div>
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                Reset Application Sessions
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                Clears all logged-in sessions, cookies, local cache, and history for all embedded services.
              </p>
            </div>
            <div>
              <button
                onClick={handleClearSessions}
                disabled={clearingState !== 'idle'}
                className={`no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none ${
                  clearingState === 'clearing'
                    ? 'bg-hover-surface text-text-muted cursor-not-allowed'
                    : clearingState === 'success'
                      ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                      : 'bg-destructive/10 hover:bg-destructive/20 text-destructive'
                }`}
              >
                {clearingState === 'clearing' && 'Clearing...'}
                {clearingState === 'success' && 'Sessions Cleared!'}
                {clearingState === 'idle' && 'Clear Sessions'}
              </button>
            </div>
          </div>
          {clearingState === 'success' && (
            <div className="text-xs text-green-400 font-normal leading-[1.4] mt-2">
              Application caches cleared. Please close and relaunch Gradd to sign in again.
            </div>
          )}
        </section>

        {/* Section: Version & Updates */}
        <section className="bg-secondary border border-surface-border rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <ArrowClockwise size={20} weight="bold" className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary leading-[1.2]">
              Version & Updates
            </h2>
          </div>
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                App Version: <span className="text-accent">v{appVersion}</span>
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4]">
                Keep Gradd up to date with the latest features, security patches, and performance updates.
              </p>
            </div>
            <div>
              <button
                onClick={handleCheckUpdates}
                disabled={checkingState === 'checking' || checkingState === 'available'}
                className={`no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  (checkingState === 'checking' || checkingState === 'available')
                    ? 'bg-hover-surface text-text-muted cursor-not-allowed border border-surface-border'
                    : checkingState === 'up-to-date'
                      ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                      : checkingState === 'error'
                        ? 'bg-destructive/10 text-destructive border border-destructive/30'
                        : checkingState === 'downloaded'
                          ? 'bg-accent text-white hover:bg-accent/80 animate-pulse'
                          : 'bg-accent text-white hover:bg-accent/80'
                }`}
              >
                {checkingState === 'checking' && (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-text-muted border-t-transparent rounded-full animate-spin inline-block" />
                    Checking for Updates...
                  </>
                )}
                {checkingState === 'available' && (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-text-muted border-t-transparent rounded-full animate-spin inline-block" />
                    Downloading Update...
                  </>
                )}
                {checkingState === 'up-to-date' && (
                  <>
                    <Check size={14} weight="bold" />
                    Up to date
                  </>
                )}
                {checkingState === 'downloaded' && 'Install & Restart'}
                {checkingState === 'error' && 'Retry Check'}
                {checkingState === 'idle' && 'Check for Updates'}
              </button>
            </div>
          </div>
          {checkingState === 'up-to-date' && (
            <div className="text-xs text-green-400 font-normal leading-[1.4] mt-2 flex items-center gap-1.5">
              <Check size={12} weight="bold" /> Gradd is currently up to date (v{appVersion}).
            </div>
          )}
          {checkingState === 'error' && (
            <div className="text-xs text-destructive font-normal leading-[1.4] mt-2 flex items-center gap-1.5">
              Failed to check for updates. {updateError}
            </div>
          )}
        </section>


      </div>
    </div>
  )
}

export default App
