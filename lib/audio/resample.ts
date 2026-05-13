export async function resampleTo16k(
  audio: Float32Array,
  fromRate: number,
): Promise<Float32Array> {
  if (audio.length === 0) {
    return new Float32Array();
  }

  if (fromRate === 16000) {
    return audio;
  }

  const frameCount = Math.max(1, Math.round((audio.length * 16000) / fromRate));
  const context = new OfflineAudioContext(1, frameCount, 16000);
  const buffer = context.createBuffer(1, audio.length, fromRate);
  const audioCopy = new Float32Array(audio.length);
  audioCopy.set(audio);
  buffer.copyToChannel(audioCopy, 0);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);

  const rendered = await context.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}
