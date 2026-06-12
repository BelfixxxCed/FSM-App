import { useState } from "react";
import { Play, Pause, Square, Plus } from 'lucide-react'
import "./App.css";

function App() {
  const [minutes, setMinutes] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [inputMinutes, setInputMinutes] = useState("25")
  const [message, set_message] = useState("hha")
  const [error, setError] = useState("")

  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`

  function handlePlay()  { console.log("play")  }
  function handlePause() { console.log("pause") }
  function handleEnd()   { console.log("end")   }
  function handleNew()   { setShowModal(true)    }

  function handleModalConfirm() {
    const parsed = parseInt(inputMinutes)
    if (!isNaN(parsed) && parsed > 0) {
      setMinutes(parsed)
      setSeconds(0)
      setShowModal(false)
    }
  }

  const controls = [
    { Icon: Play,   action: handlePlay  },
    { Icon: Pause,  action: handlePause },
    { Icon: Square, action: handleEnd   },
    { Icon: Plus,   action: handleNew   },
  ]

  return (
    <main className="min-h-screen">

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 flex flex-col items-center gap-4
            shadow-[inset_0_0_30px_rgba(255,255,255,0.3),0_8px_32px_rgba(255,100,150,0.3)]
            w-[90%] sm:w-80">
            
            <p className="text-white font-light text-lg tracking-wide">how many minutes?</p>
            
            <input
              type="number"
              value={inputMinutes}
              onChange={(e) => setInputMinutes(e.target.value)}
              className="w-full text-center text-white font-extrabold text-4xl bg-transparent border-none outline-none"
              autoFocus
            />

            <button
              onClick={handleModalConfirm}
              className="mt-2 px-8 py-2 rounded-full
                bg-linear-to-br from-red-300 via-fuchsia-200 to-pink-300
                text-white font-light tracking-widest text-sm
                hover:shadow-[0_4px_20px_rgba(255,100,150,0.5)]
                transition-all duration-300">
              let's go
            </button>

          </div>
        </div>
      )}

      <div className="flex flex-col items-center justify-center min-h-screen px-4">

        {/* Orb */}
        <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-full relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-pink-50 animate-pulse z-0" />
          <div className="absolute bg-pink-200 z-1 h-[75%] w-[75%] rounded-full opacity-50" />
          <div className="w-40 h-40 sm:w-52 sm:h-52 md:w-64 md:h-64 rounded-full
            bg-linear-to-br from-red-300 via-fuchsia-200 to-pink-300
            shadow-[inset_0_0_30px_rgba(255,255,255,0.4),0_8px_32px_rgba(255,100,150,0.3)]
            backdrop-blur-sm
            transition-all duration-700 ease-in-out
            hover:shadow-[inset_0_0_40px_rgba(255,255,255,0.6),0_8px_48px_rgba(255,100,150,0.5)]
            relative z-2">
            <input
              readOnly
              value={display}
              className="text-white font-extrabold text-3xl sm:text-4xl md:text-5xl inset-0 absolute flex items-center justify-center transition-all duration-500 bg-transparent border-none outline-none text-center"
            />
            <p
              className="text-white font-extrabold text-sm sm:text-lg md:text-xl inset-0 absolute flex items-center justify-center transition-all duration-500 bg-transparent border-none outline-none text-center mt-30"
            >{message}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 md:mt-12 h-12 w-[90%] sm:w-[75%] md:w-[60%] lg:w-[40%] mx-auto relative">
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-4 sm:gap-7
            bg-linear-to-br from-red-300 via-fuchsia-200 to-pink-300
            rounded-4xl shadow-sm shadow-pink-500">
            {controls.map(({ Icon, action }, i) => (
              <div key={i}
                onClick={action}
                className="p-2 rounded-full cursor-pointer
                  transition-all duration-300
                  hover:bg-white/30
                  hover:scale-110">
                <Icon className="text-white w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  );
}

export default App;