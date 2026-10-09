import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PhoneInput, type PhoneValue } from '@/components/ui/PhoneInput'
import { MiniCalendar } from '@/features/scheduling/components/MiniCalendar'
import { BookingSheet } from '@/components/scheduling/BookingSheet'
import type { Client } from '@/types'
import type { TrainerConfig } from '@/types/scheduling'

function App() {
  const [phone, setPhone] = useState<PhoneValue | undefined>()
  const [selectedDate, setSelectedDate] = useState(() => new Date(2026, 9, 10))
  return (
    <main>
      <h1>FitDesk React19 isolated client-side behavior fixture</h1>
      <section aria-label="Phone fixture">
        <PhoneInput label="Trainer phone" defaultCountry="US" value={phone}
          onChange={setPhone} showWhatsApp={true} />
        <pre data-testid="phone-value">{JSON.stringify(phone ?? null)}</pre>
        <button id="remote-phone-update" onClick={() => setPhone({
          phone_country:'GB',phone_country_code:'+44',phone_number:'7700900123',
          phone_full:'+447700900123',has_whatsapp:false,
        })}>Receive server phone update</button>
      </section>
      <section id="calendar-fixture">
        <MiniCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate}/>
        <button id="choose-december" onClick={() => setSelectedDate(new Date(2026, 11, 15))}>
          Receive selected date update
        </button>
        <output id="date-value">{selectedDate.toISOString().slice(0,10)}</output>
      </section>
      <section>
        <button id="open-booking" onClick={() => setBookingOpen(true)}>Open booking fixture</button>
        <BookingSheet open={bookingOpen} clients={clients} existingSessions={[]}
          selectedSlots={[new Date('2026-12-15T10:00:00Z')]}
          trainerConfig={trainerConfig} onClose={() => setBookingOpen(false)} onBooked={() => {}} />
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)
