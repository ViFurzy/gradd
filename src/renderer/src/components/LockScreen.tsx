import React, { useState } from 'react'
import { useLayoutStore } from '../store/useLayoutStore'
import { LockKey, WarningCircle } from '@phosphor-icons/react'

export default function LockScreen(): React.JSX.Element {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const { setLocked, verifyAppPin } = useLayoutStore()

  const handleKeyPress = async (num: string) => {
    if (error) {
      setError(false)
      setPin(num)
      return
    }
    
    const newPin = pin + num
    setPin(newPin)

    if (newPin.length === 4) {
      const isValid = await verifyAppPin(newPin)
      if (isValid) {
        setLocked(false)
      } else {
        setError(true)
      }
    }
  }

  const handleDelete = () => {
    if (error) {
      setError(false)
      setPin('')
    } else {
      setPin(pin.slice(0, -1))
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-[#0a0a0c] flex flex-col items-center justify-center select-none">
      <div className="w-[320px] flex flex-col items-center">
        <LockKey size={48} weight="duotone" className="text-accent mb-8" />
        
        <div className="flex gap-4 mb-10 h-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-300 ${
                pin.length > i 
                  ? error 
                    ? 'bg-destructive scale-110' 
                    : 'bg-accent scale-110'
                  : 'bg-surface-border'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-xs font-medium mb-6 animate-pulse">
            <WarningCircle size={14} weight="bold" />
            <span>Incorrect PIN</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="w-16 h-16 rounded-full bg-secondary hover:bg-hover-surface active:scale-95 text-xl font-medium text-text-primary transition-all flex items-center justify-center mx-auto"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            onClick={() => handleKeyPress('0')}
            className="w-16 h-16 rounded-full bg-secondary hover:bg-hover-surface active:scale-95 text-xl font-medium text-text-primary transition-all flex items-center justify-center mx-auto"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            disabled={pin.length === 0}
            className="w-16 h-16 rounded-full bg-transparent hover:bg-secondary active:scale-95 text-sm font-bold text-text-muted transition-all flex items-center justify-center mx-auto"
          >
            DEL
          </button>
        </div>
      </div>
    </div>
  )
}
