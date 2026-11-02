import React, { useEffect, useState, useRef } from 'react'
import { ArrowsLeftRight, Chats, Gear, Moon, SpeakerSlash } from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore } from './store/useLayoutStore'

import messengerLogo from './assets/messenger.svg'
import whatsappLogo from './assets/whatsapp.svg'
import telegramLogo from './assets/telegram.svg'
import slackLogo from './assets/slack.svg'
import instagramLogo from './assets/instagram.png'
import gadugaduLogo from './assets/gadugadu.svg'
import linkedinLogo from './assets/linkedin.svg'
import teamsLogo from './assets/teams.svg'
import logoImg from './assets/logo.png'
import LockScreen from './components/LockScreen'
import DirectoryDashboard from './components/DirectoryDashboard'
import SettingsPanel from './components/SettingsPanel'

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
    generalConfig,
    isLocked,
    setLocked
  } = useLayoutStore(
    useShallow((s) => ({
      layoutMode: s.layoutMode,
      setLayoutMode: s.setLayoutMode,
      services: s.services,
      activeServiceId: s.activeServiceId,
      activePanel: s.activePanel,
      selectService: s.selectService,
      showDirectory: s.showDirectory,
      showSettings: s.showSettings,
      initialize: s.initialize,
      setServiceUnreadCount: s.setServiceUnreadCount,
      isDndActive: s.isDndActive,
      setDndActiveState: s.setDndActiveState,
      reorderServices: s.reorderServices,
      generalConfig: s.generalConfig,
      isLocked: s.isLocked,
      setLocked: s.setLocked
    }))
  )
  const [hoveredToggle, setHoveredToggle] = useState(false)
  const [draggedServiceId, setDraggedServiceId] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const dragMovedRef = useRef(false)

  const totalUnreadCount = services
    .filter((s) => s.enabled && !s.muted)
    .reduce((sum, s) => sum + (s.unreadCount || 0), 0)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Listen for unread count updates from Electron main process
  useEffect(() => {
    return window.api.onUnreadCountsUpdated((data) => {
      setServiceUnreadCount(data.serviceId, data.count)
    })
  }, [setServiceUnreadCount])

  // Listen for DND status changes from Electron main process
  useEffect(() => {
    return window.api.onDndStatusChanged((active) => {
      setDndActiveState(active)
    })
  }, [setDndActiveState])

  // Listen for lock events
  useEffect(() => {
    return window.api.onLockApp(() => {
      if (useLayoutStore.getState().generalConfig?.hasAppLock) {
        setLocked(true)
      }
    })
  }, [setLocked])

  // A notification toast was clicked: open the service it came from
  useEffect(() => {
    return window.api.onSelectService((id) => {
      useLayoutStore.getState().selectService(id)
    })
  }, [])

  // Listen for services list updates from Electron main process (e.g. from context menus)
  useEffect(() => {
    return window.api.onServicesUpdated((updatedServices) => {
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
  }, [totalUnreadCount])

  // Synchronize boundaries of the React container with the Electron WebContentsView
  useEffect(() => {
    if (!contentRef.current) return

    let rafId: number | null = null

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

    // Debounce via rAF — coalesces rapid resize events into one IPC call per frame
    const debouncedUpdateBounds = (): void => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = null
        updateBounds()
      })
    }

    // Run immediately to capture layout mount bounds
    updateBounds()

    // Trigger bounds updates on container resizes
    const observer = new ResizeObserver(debouncedUpdateBounds)
    observer.observe(contentRef.current)

    // Trigger bounds updates on window resize
    window.addEventListener('resize', debouncedUpdateBounds)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      observer.disconnect()
      window.removeEventListener('resize', debouncedUpdateBounds)
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
      case 'linkedin':
        return <img src={linkedinLogo} className="w-5 h-5 object-contain" alt="LinkedIn" />
      case 'teams':
        return <img src={teamsLogo} className="w-5 h-5 object-contain" alt="Teams" />
      default:
        return <Chats size={20} weight="bold" />
    }
  }

  const enabledServices = services.filter((s) => s.enabled && s.type !== 'teams')

  return (
    <div className="w-screen h-screen flex flex-col select-none bg-dominant text-text-primary relative overflow-hidden">
      {isLocked && <LockScreen />}

      {/* 32px custom titlebar drag region */}
      <header
        onDoubleClick={() => window.api.doubleClickHeader()}
        className="h-8 min-h-8 bg-secondary border-b border-surface-border flex items-center justify-between px-4 drag"
      >
        <div className="flex items-center gap-2">
          <img
            src={logoImg}
            className="w-3.5 h-3.5 scale-110 object-contain select-none pointer-events-none"
            alt=""
          />
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
                        onDragEnd={() => {
                          setDraggedServiceId(null)
                          if (dragMovedRef.current) {
                            dragMovedRef.current = false
                            window.api.saveServices(useLayoutStore.getState().services)
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (draggedServiceId === null || draggedServiceId === service.id) return

                          const draggedIdx = enabledServices.findIndex(
                            (s) => s.id === draggedServiceId
                          )
                          const hoverIdx = index
                          if (draggedIdx === -1 || hoverIdx === draggedIdx) return

                          const updated = [...enabledServices]
                          const [draggedItem] = updated.splice(draggedIdx, 1)
                          updated.splice(hoverIdx, 0, draggedItem)

                          dragMovedRef.current = true
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
                        {service.unreadCount && service.unreadCount > 0 && !service.muted ? (
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
              </div>
            </aside>

            {/* Content Area */}
            <main
              ref={contentRef}
              className="relative flex-1 h-full bg-transparent flex flex-col items-center justify-start overflow-hidden content-area"
            >
              {activePanel === 'directory' ? <DirectoryDashboard /> : null}
              {activePanel === 'settings' ? <SettingsPanel /> : null}
            </main>
          </>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Top Tab Bar Layout */}
            <div className="h-[46px] min-h-[46px] bg-secondary border-b border-surface-border flex items-center justify-between px-2 select-none">
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
                  <img
                    src={logoImg}
                    className="w-[22px] h-[22px] object-contain select-none pointer-events-none"
                    alt=""
                  />
                </button>

                {/* Vertical Separator */}
                <div className="w-[1px] h-6 bg-surface-border mx-1 self-center" />

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
                        onDragEnd={() => {
                          setDraggedServiceId(null)
                          if (dragMovedRef.current) {
                            dragMovedRef.current = false
                            window.api.saveServices(useLayoutStore.getState().services)
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          if (draggedServiceId === null || draggedServiceId === service.id) return

                          const draggedIdx = enabledServices.findIndex(
                            (s) => s.id === draggedServiceId
                          )
                          const hoverIdx = index
                          if (draggedIdx === -1 || hoverIdx === draggedIdx) return

                          const updated = [...enabledServices]
                          const [draggedItem] = updated.splice(draggedIdx, 1)
                          updated.splice(hoverIdx, 0, draggedItem)

                          dragMovedRef.current = true
                          reorderServices(updated)
                        }}
                        className={`no-drag relative h-full flex items-center gap-2 px-4 transition-all duration-150 cursor-grab active:cursor-grabbing border-b-2 ${
                          isActive
                            ? 'border-accent text-text-primary bg-active-surface/30'
                            : 'border-transparent text-text-muted hover:bg-hover-surface hover:text-text-primary'
                        } ${isDragged ? 'opacity-30 scale-95 bg-active-surface/30' : ''}`}
                      >
                        <span className="flex items-center text-[15px]">
                          {getServiceIcon(service.type)}
                        </span>
                        {generalConfig?.showTabLabels !== false && (
                          <span className="text-xs font-normal leading-[1.4]">{service.name}</span>
                        )}
                        {service.muted && (
                          <SpeakerSlash
                            size={12}
                            weight="bold"
                            className="text-[#e5534b] flex-shrink-0"
                          />
                        )}
                        {/* Unread badge */}
                        {service.unreadCount && service.unreadCount > 0 && !service.muted ? (
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
                    className="w-9 h-9 flex items-center justify-center text-accent animate-pulse"
                    title="Do Not Disturb is Active"
                  >
                    <Moon size={18} weight="fill" />
                  </div>
                )}

                {/* Layout Toggle Icon Button */}
                <button
                  onClick={toggleLayout}
                  className="no-drag text-text-muted hover:text-text-primary w-9 h-9 flex items-center justify-center transition-all duration-150 rounded hover:bg-hover-surface cursor-pointer"
                  title="Switch to Sidebar"
                >
                  <ArrowsLeftRight size={18} weight="bold" />
                </button>

                {/* Settings Gear Icon Button */}
                <button
                  onClick={showSettings}
                  className={`no-drag w-9 h-9 flex items-center justify-center transition-all duration-150 rounded hover:bg-hover-surface cursor-pointer ${
                    activePanel === 'settings'
                      ? 'bg-active-surface text-accent'
                      : 'text-text-muted hover:text-text-primary bg-transparent'
                  }`}
                  title="Settings"
                >
                  <Gear size={18} weight="bold" />
                </button>
              </div>
            </div>

            {/* Content Area */}
            <main
              ref={contentRef}
              className="relative flex-1 h-full bg-transparent flex flex-col items-center justify-start overflow-hidden content-area"
            >
              {activePanel === 'directory' ? <DirectoryDashboard /> : null}
              {activePanel === 'settings' ? <SettingsPanel /> : null}
            </main>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
