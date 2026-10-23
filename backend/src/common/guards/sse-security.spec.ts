import { SseStream } from '@nestjs/core/router/sse-stream';
describe('Official NestJS SSE security fix', () => {
  test('retains valid event framing', async () => {
    const s = new SseStream(); let output = '';
    s.on('data', c => { output += c.toString(); });
    await new Promise<void>((resolve, reject) => s.write({type:'update',id:'42',data:'hello'}, e => e ? reject(e) : resolve()));
    expect(output).toContain('event: update\n'); expect(output).toContain('id: 42\n'); expect(output).toContain('data: hello\n\n');s.destroy();
  });
  test.each(['type','id','retry'])('prevents extra SSE frames through %s', async field => {
    const s=new SseStream();let output='';s.on('data',c=>{output+=c.toString()});s.on('error',()=>{});
    const error=await new Promise<Error|null|undefined>(resolve=>s.write({[field]:'valid\n\nevent: forged',data:'hello'},resolve));
    expect(error).toBeFalsy();expect(output).not.toContain('\nevent: forged');expect(output.split('\n\n').filter(Boolean)).toHaveLength(1);expect(output).toContain('data: hello\n\n');s.destroy();
  });
});
