'use strict';
// Zoom step table
const ZOOM_STEPS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,20,25,30,35,40,45,50,55,60,70,80,90,100,120,140,160,180,200];
// History trail cycle lengths  (0 = full trail)
const HISTORY_DOT_STEPS = [5,10,15,20,0];
// Label line definitions
const LABEL_LINE_DEFS = [
  { key:'callsign', label:'Callsign',  defaultOn:true,  instructorOnly:false, traineeHidden:true  },
  { key:'squawk',   label:'Squawk',    defaultOn:true,  instructorOnly:false, traineeHidden:false },
  { key:'altitude', label:'Altitude',  defaultOn:true,  instructorOnly:false, traineeHidden:false },
  { key:'speed',    label:'Speed',     defaultOn:true,  instructorOnly:false, traineeHidden:false },
  { key:'heading',  label:'Heading',   defaultOn:true,  instructorOnly:true,  traineeHidden:true  },
];
// Formation callsign pool
const FMN_CALLSIGN_POOLS = ['COLA','THOR','WOLF','HAWK','VIPER','EAGLE','TIGER','SHARK','COBRA','STORM','ALPHA','BRAVO','DELTA','ECHO','FOXTROT'];
// Lock/unlock SVG for nav-lock button
const SVG_LOCK   = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span class="desktop-label">Lock</span>`;
const SVG_UNLOCK = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg><span class="desktop-label">Pan</span>`;
const SWEEP_SPEED    = 0.012;
const RECONNECT_MAX  = 4;
const RECONNECT_DELAY= 4000;
const $ = id => document.getElementById(id);
