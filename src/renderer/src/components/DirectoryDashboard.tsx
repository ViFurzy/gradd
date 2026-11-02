import React, { useEffect, useState } from 'react'
import {
  Chats,
  DotsThree,
  PencilSimple,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
  Trash
} from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore } from '../store/useLayoutStore'
import type { ServiceConfig } from '../store/useLayoutStore'
import { ACCOUNT_COLORS, accountColor } from '../../../shared/accountColors'
import messengerLogo from '../assets/messenger.svg'
import whatsappLogo from '../assets/whatsapp.svg'
import telegramLogo from '../assets/telegram.svg'
import slackLogo from '../assets/slack.svg'
import instagramLogo from '../assets/instagram.png'
import gadugaduLogo from '../assets/gadugadu.svg'
import linkedinLogo from '../assets/linkedin.svg'
import teamsLogo from '../assets/teams.svg'
import logoImg from '../assets/logo.png'

const LOGOS: Record<string, string> = {
  whatsapp: whatsappLogo,
  telegram: telegramLogo,
  messenger: messengerLogo,
  slack: slackLogo,
  instagram: instagramLogo,
  gadugadu: gadugaduLogo,
  linkedin: linkedinLogo,
  teams: teamsLogo
}

const TYPE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  messenger: 'Messenger',
  slack: 'Slack',
  instagram: 'Instagram',
  gadugadu: 'Gadu-Gadu',
  linkedin: 'LinkedIn',
  teams: 'Teams'
}

function ServiceLogo({ type }: { type: string }): React.JSX.Element {
  const src = LOGOS[type]
  return (
    <div className="w-11 h-11 bg-dominant border border-surface-border rounded-md flex items-center justify-center shrink-0">
      {src ? (
        <img src={src} className="w-7 h-7 object-contain" alt="" />
      ) : (
        <Chats size={24} weight="bold" className="text-accent" />
      )}
    </div>
  )
}

function Switch({
  on,
  label,
  onClick
}: {
  on: boolean
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`no-drag relative w-9 h-5 shrink-0 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        on ? 'bg-accent' : 'bg-dominant border border-surface-border'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-text-primary transition-transform duration-150 ${
          on ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

const ICON_BTN =
  'no-drag w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-hover-surface cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export default function DirectoryDashboard(): React.JSX.Element {
  const {
    services,
    toggleService,
    selectService,
    toggleMuteService,
    addServiceInstance,
    removeServiceInstance,
    renameService,
    setServiceColor
  } = useLayoutStore(
    useShallow((s) => ({
      services: s.services,
      toggleService: s.toggleService,
      selectService: s.selectService,
      toggleMuteService: s.toggleMuteService,
      addServiceInstance: s.addServiceInstance,
      removeServiceInstance: s.removeServiceInstance,
      renameService: s.renameService,
      setServiceColor: s.setServiceColor
    }))
  )
  const [clearingServiceIds, setClearingServiceIds] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)

  useEffect(() => {
    if (!menuId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuId])

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

  // One group per service type (teams stays hidden), accounts in store order.
  const visible = services.filter((s) => s.type !== 'teams')
  const groups: { type: string; accounts: ServiceConfig[] }[] = []
  for (const s of visible) {
    const group = groups.find((g) => g.type === s.type)
    if (group) group.accounts.push(s)
    else groups.push({ type: s.type, accounts: [s] })
  }
  const active = groups.filter((g) => g.accounts.some((a) => a.enabled))
  const inactive = groups.filter((g) => !g.accounts.some((a) => a.enabled))

  const nameOrInput = (a: ServiceConfig, text: string, className: string): React.JSX.Element =>
    editingId === a.id ? (
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
        aria-label={`Rename ${a.name}`}
        className="no-drag w-full max-w-[260px] bg-dominant border border-surface-border rounded px-1.5 py-0.5 text-sm font-semibold text-text-primary leading-[1.2] focus:outline-none focus:border-accent"
      />
    ) : (
      <div className={className}>{text}</div>
    )

  const menuItem =
    'no-drag w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] text-text-primary hover:bg-hover-surface cursor-pointer text-left focus:outline-none focus-visible:bg-hover-surface'

  const accountMenu = (a: ServiceConfig): React.JSX.Element => {
    const isAdded = a.id !== a.type
    const close = (): void => setMenuId(null)
    return (
      <>
        <div className="fixed inset-0 z-20" onClick={close} aria-hidden="true" />
        <div
          role="menu"
          aria-label={`Actions for ${a.name}`}
          className="absolute right-2 top-full mt-1 z-30 w-56 bg-[#202027] border border-white/10 rounded-lg p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        >
          <button
            role="menuitem"
            className={menuItem}
            onClick={() => {
              close()
              addServiceInstance(a.id)
            }}
          >
            <Plus size={15} weight="bold" className="text-text-muted" />
            Add account
          </button>
          <button
            role="menuitem"
            className={menuItem}
            onClick={() => {
              close()
              setEditingId(a.id)
              setDraftName(a.name)
            }}
          >
            <PencilSimple size={15} weight="bold" className="text-text-muted" />
            Rename
          </button>
          <button
            role="menuitem"
            className={menuItem}
            onClick={() => {
              close()
              toggleMuteService(a.id)
            }}
          >
            {a.muted ? (
              <SpeakerHigh size={15} weight="bold" className="text-text-muted" />
            ) : (
              <SpeakerSlash size={15} weight="bold" className="text-text-muted" />
            )}
            {a.muted ? 'Unmute sound' : 'Mute sound'}
          </button>
          <button
            role="menuitem"
            className={menuItem}
            disabled={clearingServiceIds[a.id]}
            onClick={() => {
              close()
              handleClearService(a.id, a.name)
            }}
          >
            <Trash size={15} weight="bold" className="text-text-muted" />
            Clear session data
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-2" role="group" aria-label="Color">
            {ACCOUNT_COLORS.map((color) => (
              <button
                key={color}
                aria-label={`Color ${color}`}
                onClick={() => setServiceColor(a.id, color)}
                style={{ background: color }}
                className={`no-drag w-4 h-4 rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  accountColor(services, a.id) === color
                    ? 'ring-2 ring-text-primary ring-offset-2 ring-offset-[#202027]'
                    : ''
                }`}
              />
            ))}
          </div>
          {isAdded && (
            <>
              <div className="my-1 border-t border-surface-border" />
              <button
                role="menuitem"
                className={`${menuItem} !text-destructive`}
                onClick={() => {
                  close()
                  handleRemoveService(a.id, a.name)
                }}
              >
                <Trash size={15} weight="bold" />
                Remove account
              </button>
            </>
          )}
        </div>
      </>
    )
  }

  const controls = (a: ServiceConfig): React.JSX.Element => (
    <div className="flex items-center gap-1.5 shrink-0">
      {a.enabled && (
        <button
          onClick={() => selectService(a.id)}
          className="no-drag px-3 py-1.5 mr-1 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold leading-[1.4] rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Open
        </button>
      )}
      <button
        onClick={() => toggleMuteService(a.id)}
        className={ICON_BTN}
        title={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`}
        aria-label={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`}
      >
        {a.muted ? (
          <SpeakerSlash size={16} weight="bold" className="text-destructive" />
        ) : (
          <SpeakerHigh size={16} weight="bold" />
        )}
      </button>
      <button
        onClick={() => setMenuId(menuId === a.id ? null : a.id)}
        className={`${ICON_BTN} ${menuId === a.id ? 'bg-hover-surface text-text-primary' : ''}`}
        aria-haspopup="menu"
        aria-expanded={menuId === a.id}
        aria-label={`More actions for ${a.name}`}
      >
        <DotsThree size={18} weight="bold" />
      </button>
      <div className="ml-1.5">
        <Switch on={a.enabled} label={`Toggle ${a.name}`} onClick={() => toggleService(a.id)} />
      </div>
    </div>
  )

  const unreadPill = (a: ServiceConfig): React.JSX.Element | null =>
    a.unreadCount ? (
      <span className="min-w-[18px] h-[18px] px-[5px] rounded-full bg-accent text-white text-[11px] font-semibold inline-flex items-center justify-center">
        {a.unreadCount}
      </span>
    ) : null

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
            {groups.length} services, {visible.length} accounts. Enabled accounts appear in your
            panel.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {active.map((group) => {
          const multi = group.accounts.length > 1
          const first = group.accounts[0]
          const unread = group.accounts.reduce((n, a) => n + (a.unreadCount || 0), 0)
          return (
            <div
              key={group.type}
              className="bg-secondary border border-surface-border rounded-lg relative"
            >
              <div className="flex items-center gap-3.5 px-3.5 py-3 relative">
                <ServiceLogo type={group.type} />
                <div className="min-w-0 flex-1">
                  {multi
                    ? nameOrInput(
                        first,
                        TYPE_LABELS[group.type] ?? group.type,
                        'text-sm font-semibold text-text-primary leading-[1.2] truncate'
                      )
                    : nameOrInput(
                        first,
                        first.name,
                        `text-sm font-semibold leading-[1.2] truncate ${
                          first.enabled ? 'text-text-primary' : 'text-text-muted'
                        }`
                      )}
                  <div className="mt-1 text-xs text-text-muted leading-[1.4]">
                    {multi ? `${group.accounts.length} accounts` : '1 account'}
                    {unread > 0 && !multi ? `, ${unread} unread` : ''}
                  </div>
                </div>
                {!multi && controls(first)}
                {!multi && menuId === first.id && accountMenu(first)}
              </div>

              {multi &&
                group.accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 pl-8 pr-3.5 py-2 border-t border-surface-border relative"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: accountColor(services, a.id) }}
                      aria-hidden="true"
                    />
                    {nameOrInput(
                      a,
                      a.name,
                      `text-[13px] font-medium truncate ${
                        a.enabled ? 'text-text-primary' : 'text-text-muted'
                      }`
                    )}
                    {unreadPill(a)}
                    <div className="flex-1" />
                    {controls(a)}
                    {menuId === a.id && accountMenu(a)}
                  </div>
                ))}

              {multi && (
                <div className="px-3.5 py-2 border-t border-surface-border">
                  <button
                    onClick={() => addServiceInstance(first.id)}
                    className="no-drag inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-dashed border-surface-border text-xs text-text-muted hover:text-text-primary hover:border-text-muted/40 cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Plus size={13} weight="bold" />
                    Add account
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {inactive.length > 0 && (
        <>
          <div className="mt-7 mb-2.5 text-xs text-text-muted">Not enabled</div>
          <div className="flex flex-col gap-2.5">
            {inactive.map((group) => (
              <div
                key={group.type}
                className="bg-secondary border border-surface-border rounded-lg flex items-center gap-3.5 px-3.5 py-3"
              >
                <ServiceLogo type={group.type} />
                <div className="text-sm font-semibold text-text-muted leading-[1.2] flex-1">
                  {TYPE_LABELS[group.type] ?? group.type}
                </div>
                <button
                  onClick={() => toggleService(group.accounts[0].id)}
                  aria-label={`Enable ${TYPE_LABELS[group.type] ?? group.type}`}
                  className="no-drag px-3 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold leading-[1.4] rounded-md transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Enable
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
