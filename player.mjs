// Pure timeline: callers provide elapsed time; no DOM or wall-clock dependencies.
export class LecturePlayer {
  constructor(segments) {
    if (!segments.length || segments.some(s => !Number.isFinite(s.duration) || s.duration <= 0)) throw new Error('Segments require positive durations');
    this.segments = segments;
    this.index = 0;
    this.offset = 0;
    this.state = 'ready';
  }
  get segment() { return this.segments[this.index]; }
  get duration() { return this.segments.reduce((sum,s) => sum+s.duration,0); }
  get elapsed() { return this.segments.slice(0,this.index).reduce((sum,s) => sum+s.duration,0)+this.offset; }
  play() { if (this.state === 'ready' || this.state === 'paused') this.state = 'playing'; }
  pause() { if (this.state === 'playing') this.state = 'paused'; }
  restart() { this.index=0; this.offset=0; this.state='ready'; }
  seekSlide(slide) {
    const index=this.segments.findIndex(s => s.slide===slide);
    if(index<0) return;
    this.index=index; this.offset=0; this.state='paused';
  }
  continue() {
    if(this.state!=='activity') return;
    if(this.index===this.segments.length-1){this.state='completed';return;}
    this.index++; this.offset=0; this.state='playing';
  }
  tick(seconds) {
    if(this.state!=='playing' || !Number.isFinite(seconds) || seconds<=0) return;
    this.offset+=seconds;
    while(this.offset>=this.segment.duration){
      const remainder=this.offset-this.segment.duration;
      this.offset=this.segment.duration;
      if(this.segment.holdAfter){this.state='activity';return;}
      if(this.index===this.segments.length-1){this.state='completed';return;}
      this.index++; this.offset=remainder;
    }
  }
}
