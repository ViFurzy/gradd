import React, { useEffect, useState } from 'react'
import {
  Trash,
  Moon,
  Desktop,
  ArrowClockwise,
  Check,
  FloppyDisk,
  LockKey
} from '@phosphor-icons/react'
import { useShallow } from 'zustand/react/shallow'
import { useLayoutStore } from '../store/useLayoutStore'
import logoImg from '../assets/logo.png'

export default function SettingsPanel(): React.JSX.Element {
  const {
    dndConfig,
    isDndActive,
    updateDndConfig,
    generalConfig,
    updateGeneralConfig,
    layoutMode,
    setAppPin
  } = useLayoutStore(
    useShallow((s) => ({
      dndConfig: s.dndConfig,
      isDndActive: s.isDndActive,
      updateDndConfig: s.updateDndConfig,
      generalConfig: s.generalConfig,
      updateGeneralConfig: s.updateGeneralConfig,
      layoutMode: s.layoutMode,
      setAppPin: s.setAppPin
    }))
  )
  const [clearingState, setClearingState] = useState<'idle' | 'clearing' | 'success'>('idle')
  const [resetConfirming, setResetConfirming] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('0.0.0')
  const [checkingState, setCheckingState] = useState<
    'idle' | 'checking' | 'up-to-date' | 'available' | 'downloaded' | 'error'
  >('idle')
  const [updateError, setUpdateError] = useState<string>('')
  const [stats, setStats] = useState<{ dau: number; mau: number } | null>(null)
  const [statsError, setStatsError] = useState<string>('')
  const [pinMode, setPinMode] = useState<'set' | 'change' | 'remove' | null>(null)
  const [pinNew, setPinNew] = useState('')
  const [pinCurrent, setPinCurrent] = useState('')
  const [pinError, setPinError] = useState('')
  const closePinForm = (): void => {
    setPinMode(null)
    setPinNew('')
    setPinCurrent('')
    setPinError('')
  }
  const submitPinForm = async (): Promise<void> => {
    if (pinMode !== 'remove' && !/^\d{4}$/.test(pinNew)) {
      setPinError('PIN must be exactly 4 digits.')
      return
    }
    if (pinMode !== 'set' && !/^\d{4}$/.test(pinCurrent)) {
      setPinError('Enter your current 4-digit PIN.')
      return
    }
    const ok = await setAppPin(
      pinMode === 'remove' ? '' : pinNew,
      pinMode === 'set' ? undefined : pinCurrent
    )
    if (ok) closePinForm()
    else
      setPinError(
        pinMode === 'set'
          ? 'Could not set PIN.'
          : 'Current PIN is incorrect, or too many attempts. Try again later.'
      )
  }

  useEffect(() => {
    window.api
      .getAppVersion()
      .then((v) => setAppVersion(v))
      .catch((err) => console.error('Failed to get app version:', err))

    window.api
      .getActiveUserStats()
      .then(setStats)
      .catch((err) => setStatsError(err.message))

    const unsubs = [
      window.api.onUpdateChecking(() => setCheckingState('checking')),
      window.api.onUpdateAvailable(() => setCheckingState('available')),
      window.api.onUpdateNotAvailable(() => {
        setCheckingState('up-to-date')
        setTimeout(() => setCheckingState('idle'), 5000)
      }),
      window.api.onUpdateDownloaded(() => setCheckingState('downloaded')),
      window.api.onUpdateError((err) => {
        setCheckingState('error')
        setUpdateError(err)
        setTimeout(() => setCheckingState('idle'), 5000)
      })
    ]
    return () => unsubs.forEach((u) => u())
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
        <img
          src={logoImg}
          className="w-12 h-12 object-contain select-none pointer-events-none"
          alt=""
        />
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
                When enabled, closing the window will minimize Gradd to the system tray. When
                disabled, closing the window will fully quit the app.
              </p>
            </div>
            <button
              onClick={() => updateGeneralConfig({ closeToTray: !generalConfig?.closeToTray })}
              className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                generalConfig?.closeToTray !== false
                  ? 'bg-accent'
                  : 'bg-dominant border border-surface-border'
              }`}
            >
              <div
                className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                  generalConfig?.closeToTray !== false ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Show Tab Labels Toggle */}
          <div
            className={`flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1 ${layoutMode !== 'tabs' ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                Show service names in top bar
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                When enabled, each tab in the top bar shows the service name next to its icon.
                Disable for a more compact, icon-only tab bar.
                {layoutMode !== 'tabs' && (
                  <span className="ml-1 text-text-muted/60">
                    (Switch to top bar layout to use this setting.)
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() =>
                updateGeneralConfig({ showTabLabels: generalConfig?.showTabLabels === false })
              }
              className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                generalConfig?.showTabLabels !== false
                  ? 'bg-accent'
                  : 'bg-dominant border border-surface-border'
              }`}
            >
              <div
                className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                  generalConfig?.showTabLabels !== false ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Save RAM Toggle */}
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">Save RAM</h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                When enabled, services you haven&apos;t used for 5 minutes are unloaded to free
                memory, then briefly reloaded every 5 minutes to check for new messages.
                Notifications from unloaded services can arrive up to 5 minutes late. Disable to
                keep every opened service live.
              </p>
            </div>
            <button
              onClick={() => updateGeneralConfig({ saveRam: generalConfig?.saveRam === false })}
              className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                generalConfig?.saveRam !== false
                  ? 'bg-accent'
                  : 'bg-dominant border border-surface-border'
              }`}
            >
              <div
                className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                  generalConfig?.saveRam !== false ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Start with Windows Toggle */}
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                Start with Windows
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                When enabled, Gradd launches automatically when you log in to Windows.
              </p>
            </div>
            <button
              onClick={() =>
                updateGeneralConfig({ startWithWindows: !generalConfig?.startWithWindows })
              }
              className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                generalConfig?.startWithWindows
                  ? 'bg-accent'
                  : 'bg-dominant border border-surface-border'
              }`}
            >
              <div
                className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                  generalConfig?.startWithWindows ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Section 1.5: Privacy & Security */}
        <section className="bg-secondary border border-surface-border rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <LockKey size={20} weight="bold" className="text-accent" />
            <h2 className="text-sm font-semibold text-text-primary leading-[1.2]">
              Privacy & Security
            </h2>
          </div>
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4 mt-1">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                App Lock (4-Digit PIN)
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                When enabled, Gradd will require a PIN when starting or restoring from the system
                tray. OS lock/sleep will also trigger it automatically.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {generalConfig?.hasAppLock && (
                <button
                  onClick={() => {
                    closePinForm()
                    setPinMode('change')
                  }}
                  className="no-drag px-3 py-1.5 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none border bg-secondary hover:bg-hover-surface text-text-primary border-surface-border"
                >
                  Change PIN
                </button>
              )}
              <button
                onClick={() => {
                  closePinForm()
                  setPinMode(generalConfig?.hasAppLock ? 'remove' : 'set')
                }}
                className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                  generalConfig?.hasAppLock
                    ? 'bg-accent'
                    : 'bg-dominant border border-surface-border'
                }`}
              >
                <div
                  className={`absolute top-[3px] left-[3px] w-4.5 h-4.5 rounded-full bg-text-primary shadow transform transition-transform duration-150 ${
                    generalConfig?.hasAppLock ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
          {pinMode && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void submitPinForm()
              }}
              className="flex flex-col gap-3 border-t border-surface-border/50 pt-4"
            >
              <div className="flex items-center gap-3">
                {pinMode !== 'set' && (
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    autoFocus
                    value={pinCurrent}
                    onChange={(e) => setPinCurrent(e.target.value.replace(/\D/g, ''))}
                    placeholder="Current PIN"
                    className="no-drag w-28 px-3 py-1.5 text-xs rounded border border-surface-border bg-dominant text-text-primary focus:outline-none focus:border-accent"
                  />
                )}
                {pinMode !== 'remove' && (
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    autoFocus={pinMode === 'set'}
                    value={pinNew}
                    onChange={(e) => setPinNew(e.target.value.replace(/\D/g, ''))}
                    placeholder="New PIN"
                    className="no-drag w-28 px-3 py-1.5 text-xs rounded border border-surface-border bg-dominant text-text-primary focus:outline-none focus:border-accent"
                  />
                )}
                <button
                  type="submit"
                  className="no-drag px-3 py-1.5 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none border bg-accent text-white border-accent"
                >
                  {pinMode === 'remove' ? 'Remove PIN' : 'Save PIN'}
                </button>
                <button
                  type="button"
                  onClick={closePinForm}
                  className="no-drag px-3 py-1.5 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none border bg-secondary hover:bg-hover-surface text-text-primary border-surface-border"
                >
                  Cancel
                </button>
              </div>
              {pinError && <p className="text-xs text-destructive leading-[1.4]">{pinError}</p>}
            </form>
          )}
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
                Manually save your exact setup (services, layouts, and DND states) to a local file,
                or load an existing one.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const res = await window.api.exportConfig()
                  if (res.success) {
                    alert('Configuration exported successfully!')
                  } else if (res.error) {
                    alert('Export failed: ' + res.error)
                  }
                }}
                className="no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none bg-dominant hover:bg-hover-surface text-text-primary border border-surface-border"
              >
                Export Config
              </button>
              <button
                onClick={async () => {
                  const res = await window.api.importConfig()
                  if (res.success) {
                    // App will automatically restart
                  } else if (res.error) {
                    alert('Import failed: ' + res.error)
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
        <section
          className={`bg-secondary border rounded-lg p-5 flex flex-col gap-4 transition-all duration-150 ${
            isDndActive ? 'border-accent/30' : 'border-surface-border'
          }`}
        >
          <div className="flex items-center gap-3">
            <Moon
              size={20}
              weight={isDndActive ? 'fill' : 'bold'}
              className={isDndActive ? 'text-accent animate-pulse' : 'text-text-muted'}
            />
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
                <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                  Enable Do Not Disturb
                </h3>
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
                <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                  Recurring DND Schedule
                </h3>
                <p className="text-xs text-text-muted mt-1 leading-[1.4]">
                  Automatically activate Do Not Disturb during specific hours.
                </p>
              </div>
              <button
                onClick={() => updateDndConfig({ scheduleEnabled: !dndConfig.scheduleEnabled })}
                className={`no-drag relative w-10 h-6 rounded-full transition-colors duration-150 cursor-pointer focus:outline-none ${
                  dndConfig.scheduleEnabled
                    ? 'bg-accent'
                    : 'bg-dominant border border-surface-border'
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
                  <label
                    htmlFor="dnd-start-time"
                    className="text-[11px] font-semibold text-text-muted"
                  >
                    Start Time
                  </label>
                  <input
                    id="dnd-start-time"
                    type="time"
                    value={dndConfig.startTime}
                    onChange={(e) => updateDndConfig({ startTime: e.target.value })}
                    className="no-drag bg-dominant border border-surface-border rounded px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-accent w-full cursor-pointer"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label
                    htmlFor="dnd-end-time"
                    className="text-[11px] font-semibold text-text-muted"
                  >
                    End Time
                  </label>
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
                Clears all logged-in sessions, cookies, local cache, and history for all embedded
                services.
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

          {/* Reset App to Defaults */}
          <div className="flex items-center justify-between border-t border-surface-border/50 pt-4">
            <div>
              <h3 className="text-xs font-semibold text-text-primary leading-[1.2]">
                Reset App to Defaults
              </h3>
              <p className="text-xs text-text-muted mt-1 leading-[1.4] max-w-[450px]">
                Wipes all settings, service configuration, and sessions. Gradd restarts fresh.
                Cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {resetConfirming ? (
                <>
                  <button
                    onClick={() => setResetConfirming(false)}
                    className="no-drag px-3 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none bg-secondary hover:bg-hover-surface text-text-muted border border-surface-border"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => window.api.clearConfig()}
                    className="no-drag px-3 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none bg-destructive hover:bg-destructive/80 text-white"
                  >
                    Yes, reset everything
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setResetConfirming(true)}
                  className="no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer select-none bg-destructive/10 hover:bg-destructive/20 text-destructive"
                >
                  Reset App
                </button>
              )}
            </div>
          </div>
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
                Keep Gradd up to date with the latest features, security patches, and performance
                updates.
              </p>
            </div>
            <div>
              <button
                onClick={handleCheckUpdates}
                disabled={checkingState === 'checking' || checkingState === 'available'}
                className={`no-drag px-4 py-2 text-xs font-semibold leading-[1.4] rounded transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
                  checkingState === 'checking' || checkingState === 'available'
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
          <div className="border-t border-surface-border/50 pt-3 mt-1 flex items-center justify-between">
            <span className="text-xs text-text-muted">v{appVersion} · MIT License</span>
            <a
              href="https://vi-design.pro"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault()
                window.api.openExternal('https://vi-design.pro')
              }}
              className="text-xs text-text-muted hover:text-text-primary transition-colors duration-150 cursor-pointer"
            >
              ViFurzy · vi-design.pro
            </a>
          </div>
        </section>

        {/* Section: Dev-only DAU/MAU readout */}
        {(stats || statsError) && (
          <section className="bg-secondary border border-surface-border rounded-lg p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-text-primary leading-[1.2]">
              Active Users (dev only)
            </h2>
            {stats && (
              <div className="flex gap-6 text-xs text-text-primary">
                <span>
                  DAU: <span className="text-accent font-semibold">{stats.dau}</span>
                </span>
                <span>
                  MAU: <span className="text-accent font-semibold">{stats.mau}</span>
                </span>
              </div>
            )}
            {statsError && <span className="text-xs text-destructive">{statsError}</span>}
          </section>
        )}
      </div>
    </div>
  )
}
