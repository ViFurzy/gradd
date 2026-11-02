import React, { useState } from 'react'
import { Chats, Trash, SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore } from '../store/useLayoutStore'
import messengerLogo from '../assets/messenger.svg'
import whatsappLogo from '../assets/whatsapp.svg'
import telegramLogo from '../assets/telegram.svg'
import slackLogo from '../assets/slack.svg'
import instagramLogo from '../assets/instagram.png'
import gadugaduLogo from '../assets/gadugadu.svg'
import linkedinLogo from '../assets/linkedin.svg'
import teamsLogo from '../assets/teams.svg'
import logoImg from '../assets/logo.png'

export default function DirectoryDashboard(): React.JSX.Element {
  const {
    services,
    toggleService,
    selectService,
    toggleMuteService,
    addServiceInstance,
    removeServiceInstance,
    renameService
  } = useLayoutStore(
    useShallow((s) => ({
      services: s.services,
      toggleService: s.toggleService,
      selectService: s.selectService,
      toggleMuteService: s.toggleMuteService,
      addServiceInstance: s.addServiceInstance,
      removeServiceInstance: s.removeServiceInstance,
      renameService: s.renameService
    }))
  )
  const [clearingServiceIds, setClearingServiceIds] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const commitRename = async (): Promise<void> => {
    if (editingId) await renameService(editingId, draftName)
    setEditingId(null)
  }

  const handleRemoveService = async (serviceId: string, name: string): Promise<void> => {
    const confirmed = window.confirm(
      `Remove "${name}"? Its login session and local data will be deleted.`
    )
    if (confirmed) await removeServiceInstance(serviceId)
  }

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
      case 'linkedin':
        return <img src={linkedinLogo} className="w-8 h-8 object-contain" alt="LinkedIn" />
      case 'teams':
        return <img src={teamsLogo} className="w-8 h-8 object-contain" alt="Teams" />
      default:
        return <Chats size={28} weight="bold" className="text-[#006AFF]" />
    }
  }

  return (
    <div className="w-full max-w-4xl px-8 py-6 h-full overflow-y-auto flex flex-col justify-start select-none content-area no-scrollbar">
      <div className="mb-8 border-b border-surface-border pb-4 flex items-center gap-4">
        <img
          src={logoImg}
          className="w-12 h-12 object-contain select-none pointer-events-none"
          alt=""
        />
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
        {services
          .filter((s) => s.type !== 'teams')
          .map((service) => {
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
                  <div className="min-w-0">
                    {editingId === service.id ? (
                      <input
                        autoFocus
                        value={draftName}
                        maxLength={60}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        aria-label={`Rename ${service.name}`}
                        className="no-drag w-full bg-dominant border border-surface-border rounded px-1.5 py-0.5 text-sm font-semibold text-text-primary leading-[1.2] focus:outline-none focus:border-accent"
                      />
                    ) : (
                      <h3 className="text-sm font-semibold text-text-primary leading-[1.2] truncate">
                        {service.name}
                      </h3>
                    )}
                    <div className="no-drag flex items-center gap-2 mt-1 text-[11px] leading-[1.4] text-text-muted">
                      <button
                        onClick={() => addServiceInstance(service.id)}
                        className="hover:text-accent cursor-pointer focus:outline-none"
                      >
                        + Add account
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(service.id)
                          setDraftName(service.name)
                        }}
                        className="hover:text-accent cursor-pointer focus:outline-none"
                      >
                        Rename
                      </button>
                      {service.id !== service.type && (
                        <button
                          onClick={() => handleRemoveService(service.id, service.name)}
                          className="hover:text-[#e5534b] cursor-pointer focus:outline-none"
                        >
                          Remove
                        </button>
                      )}
                    </div>
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
