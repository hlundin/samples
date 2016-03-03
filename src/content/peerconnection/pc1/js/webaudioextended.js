/*
 *  Copyright (c) 2016 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

// WebAudioExtended helper class which takes care of the WebAudio related parts.

/* global WindowFunction, DSP, FFT */

function WebAudioExtended() {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  /* global AudioContext */
  this.context = new AudioContext();
}

WebAudioExtended.prototype.applyFilter = function(stream) {
  this.mic = this.context.createMediaStreamSource(stream);
  var blockSize = 1024;
  var fftSize = 2 * blockSize;
  var shiftHz = 200; // Was 430; the higher the more "warping".
  var ctx = this.context;
  var effect = (function() {
    var inputMem = new Float32Array(fftSize).fill(0);
    var outputMem = new Float32Array(fftSize).fill(0);
    var node = ctx.createScriptProcessor(blockSize, 1, 1);
    var hammingWin = new WindowFunction(DSP.HAMMING);
    node.onaudioprocess = function(e) {
      // Get the input and output arrays.
      var input = e.inputBuffer.getChannelData(0);
      var output = e.outputBuffer.getChannelData(0);
      // Copy input to last half of inputMem. (First half is populated with
      // the input from last time.)
      for (var i = 0; i < blockSize; i++) {
        inputMem[blockSize + i] = input[i];
      }

      // Perform FFT of input.
      var fft = new FFT(fftSize, e.srcElement.context.sampleRate);
      fft.forward(inputMem);

      // Modify the signal in the frequency domain.
      // Shift all frequency bins (except DC) N steps towards "lower
      // freqencies".
      var N = Math.ceil(shiftHz * fftSize / e.srcElement.context.sampleRate);
      for (var j = 1; j < fftSize/2 - N; j++) {
        fft.real[j] = fft.real[j + N];
        fft.imag[j] = fft.imag[j + N];
        fft.real[fftSize - 1 - j] = fft.real[fftSize - 1 - j - N];
        fft.imag[fftSize - 1 - j] = fft.imag[fftSize - 1 - j - N];
      }
      // Zero out the N highest frequencies.
      for (var k = fftSize/2 - N; k < fftSize/2 + N; k++) {
        fft.real[k] = 0;
        fft.imag[k] = 0;
      }

      // Inverse FFT and window.
      var tempoutput = hammingWin.process(fft.inverse(fft.real, fft.imag));

      // Add first half of tempoutput to first half of outputMem. The second
      // half of tempoutput is copied to the second half of outputMem for
      // use next time.
      for (var m = 0; m < blockSize; m++) {
        outputMem[m] += tempoutput[m];
        outputMem[blockSize + m] = tempoutput[blockSize + m];
      }
      // Output first half of outputMem now.
      for (var n = 0; n < blockSize; n++) {
        output[n] = outputMem[n];
      }
      // Shift last half of inputMem and outputMem to first half to prepare
      // for the next round.
      inputMem.copyWithin(0, blockSize);
      outputMem.copyWithin(0, blockSize);
    };
    return node;
  })();
  this.mic.connect(effect);
  this.peer = this.context.createMediaStreamDestination();
  effect.connect(this.peer);
  return this.peer.stream;
};

WebAudioExtended.prototype.stop = function() {
  this.mic.disconnect(0);
  this.mic = null;
  this.peer = null;
};
