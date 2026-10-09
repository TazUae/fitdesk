// Transport-only fixture dependencies. The real BookingSheet state, draft
// reducer and scheduling engine stay under test. NO server actions may execute.
const childModules={
  BookingStepper:`import {createElement as h} from 'react'
    export function BookingStepper({step,onJump}){
      return h('div',null,h('output',{'data-testid':'booking-step'},step),
        h('button',{type:'button',id:'booking-jump-client',onClick:()=>onJump('client')},'Clients'),
        h('button',{type:'button',id:'booking-jump-review',onClick:()=>onJump('review')},'Review'))
    }`,
  BookingClientStep:`import {createElement as h} from 'react'
    export function BookingClientStep({clients,selectedId,onSelect}){
      return h('div',null,h('output',{'data-testid':'selected-client'},selectedId||'none'),
      ...clients.map(c=>h('button',{type:'button',key:c.id,'data-testid':'choose-'+c.id,onClick:()=>onSelect(c.id)},c.name)))
    }`,
  BookingDateTimeStep:`import {createElement as h} from 'react'
    export function BookingDateTimeStep({date,startTime}){
      return h('output',{'data-testid':'booking-time'},date+' '+startTime)
    }`,
  BookingPatternStep:`import {createElement as h} from 'react'
    export function BookingPatternStep(){return h('span',null,'Pattern fixture')}`,
  BookingReviewStep:`import {createElement as h} from 'react'
    export function BookingReviewStep({fee,client}){
      return h('div',null,h('output',{'data-testid':'booking-fee'},String(fee)),
        h('output',{'data-testid':'booking-client-name'},client?.name||'none'))
    }`,
  BookingSuccessSheet:`import {createElement as h} from 'react'
    export function BookingSuccessSheet(){return h('span',null,'Success fixture')}`,
  BookingStickyFooter:`import {createElement as h} from 'react'
    export function BookingStickyFooter({canProceed,onPrimary}) {
      return h('button',{id:'booking-next',type:'button',disabled:canProceed===false,onClick:onPrimary},'Next')
    }`,
}
export function bookingComponentMocks() {
 const virtual='\0phase2-mock-'
 return {
   name:'fitdesk-phase2-no-write-booking-mocks',
   enforce:'pre',
   resolveId(source){
     if(source==='@/actions/schedulingActions')return virtual+'actions'
     if(source.startsWith('@/components/scheduling/booking/')){
       const part=source.split('/').pop()
       if(part in childModules)return virtual+part
     }
   },
   load(id){
     if(id===virtual+'actions')return 'export async function buildPlanAction(){throw Error("Fixture forbids server booking writes")}\nexport async function bookPlanAction(){throw Error("Fixture forbids server booking writes")}'
     if(id.startsWith(virtual))return childModules[id.slice(virtual.length)]??null
   },
 }
}
