/**
 * Pure JavaScript Neural Network Implementation
 * Optimized for poker card/value recognition
 * No external ML dependencies required
 */

export interface Tensor {
  data: Float32Array;
  shape: number[];
}

export function createTensor(shape: number[], data?: Float32Array | number[]): Tensor {
  const size = shape.reduce((a, b) => a * b, 1);
  return {
    data: data ? new Float32Array(data) : new Float32Array(size),
    shape: [...shape]
  };
}

export function relu(x: number): number {
  return Math.max(0, x);
}

export function softmax(arr: Float32Array): Float32Array {
  const max = Math.max(...arr);
  const exps = arr.map(x => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return new Float32Array(exps.map(e => e / sum));
}

export class ConvLayer {
  private filters: Tensor[];
  private biases: Float32Array;
  private kernelSize: number;
  private stride: number;
  private numFilters: number;
  private inputDepth: number;

  constructor(
    numFilters: number,
    kernelSize: number,
    inputDepth: number,
    stride: number = 1
  ) {
    this.numFilters = numFilters;
    this.kernelSize = kernelSize;
    this.stride = stride;
    this.inputDepth = inputDepth;
    this.filters = [];
    this.biases = new Float32Array(numFilters);
    
    for (let f = 0; f < numFilters; f++) {
      const filter = createTensor([kernelSize, kernelSize, inputDepth]);
      const fanIn = kernelSize * kernelSize * inputDepth;
      const scale = Math.sqrt(2.0 / fanIn);
      for (let i = 0; i < filter.data.length; i++) {
        filter.data[i] = (Math.random() * 2 - 1) * scale;
      }
      this.filters.push(filter);
      this.biases[f] = 0.01;
    }
  }

  forward(input: Tensor): Tensor {
    const [height, width, depth] = input.shape;
    const outHeight = Math.floor((height - this.kernelSize) / this.stride) + 1;
    const outWidth = Math.floor((width - this.kernelSize) / this.stride) + 1;
    const output = createTensor([outHeight, outWidth, this.numFilters]);

    for (let f = 0; f < this.numFilters; f++) {
      const filter = this.filters[f];
      for (let y = 0; y < outHeight; y++) {
        for (let x = 0; x < outWidth; x++) {
          let sum = this.biases[f];
          const startY = y * this.stride;
          const startX = x * this.stride;
          
          for (let ky = 0; ky < this.kernelSize; ky++) {
            for (let kx = 0; kx < this.kernelSize; kx++) {
              for (let d = 0; d < depth; d++) {
                const iy = startY + ky;
                const ix = startX + kx;
                
                // Bounds check
                if (iy >= 0 && iy < height && ix >= 0 && ix < width) {
                  const inputIdx = (iy * width + ix) * depth + d;
                  const filterIdx = (ky * this.kernelSize + kx) * depth + d;
                  sum += input.data[inputIdx] * filter.data[filterIdx];
                }
              }
            }
          }
          
          const outIdx = (y * outWidth + x) * this.numFilters + f;
          output.data[outIdx] = relu(sum);
        }
      }
    }

    return output;
  }

  getWeights(): { filters: Tensor[], biases: Float32Array } {
    return { filters: this.filters, biases: this.biases };
  }

  setWeights(weights: { filters: Tensor[], biases: Float32Array }): void {
    this.filters = weights.filters;
    this.biases = weights.biases;
  }
}

export class MaxPoolLayer {
  private poolSize: number;
  private stride: number;

  constructor(poolSize: number = 2, stride: number = 2) {
    this.poolSize = poolSize;
    this.stride = stride;
  }

  forward(input: Tensor): Tensor {
    const [height, width, depth] = input.shape;
    const outHeight = Math.floor((height - this.poolSize) / this.stride) + 1;
    const outWidth = Math.floor((width - this.poolSize) / this.stride) + 1;
    const output = createTensor([outHeight, outWidth, depth]);

    for (let d = 0; d < depth; d++) {
      for (let y = 0; y < outHeight; y++) {
        for (let x = 0; x < outWidth; x++) {
          let max = -Infinity;
          const startY = y * this.stride;
          const startX = x * this.stride;
          
          for (let py = 0; py < this.poolSize; py++) {
            for (let px = 0; px < this.poolSize; px++) {
              const iy = startY + py;
              const ix = startX + px;
              if (iy >= 0 && iy < height && ix >= 0 && ix < width) {
                const inputIdx = (iy * width + ix) * depth + d;
                max = Math.max(max, input.data[inputIdx]);
              }
            }
          }
          
          const outIdx = (y * outWidth + x) * depth + d;
          output.data[outIdx] = max === -Infinity ? 0 : max;
        }
      }
    }

    return output;
  }
}

export class DenseLayer {
  private weights: Float32Array;
  private biases: Float32Array;
  private inputSize: number;
  private outputSize: number;
  private activation: 'relu' | 'softmax' | 'sigmoid' | 'none';

  constructor(
    inputSize: number,
    outputSize: number,
    activation: 'relu' | 'softmax' | 'sigmoid' | 'none' = 'relu'
  ) {
    this.inputSize = inputSize;
    this.outputSize = outputSize;
    this.activation = activation;
    
    const scale = Math.sqrt(2.0 / inputSize);
    this.weights = new Float32Array(inputSize * outputSize);
    this.biases = new Float32Array(outputSize);
    
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (Math.random() * 2 - 1) * scale;
    }
    for (let i = 0; i < this.biases.length; i++) {
      this.biases[i] = 0.01;
    }
  }

  forward(input: Float32Array): Float32Array {
    const output = new Float32Array(this.outputSize);
    
    for (let o = 0; o < this.outputSize; o++) {
      let sum = this.biases[o];
      for (let i = 0; i < this.inputSize; i++) {
        sum += input[i] * this.weights[i * this.outputSize + o];
      }
      output[o] = sum;
    }
    
    if (this.activation === 'relu') {
      for (let i = 0; i < output.length; i++) {
        output[i] = relu(output[i]);
      }
    } else if (this.activation === 'softmax') {
      return softmax(output);
    } else if (this.activation === 'sigmoid') {
      for (let i = 0; i < output.length; i++) {
        output[i] = 1 / (1 + Math.exp(-output[i]));
      }
    }
    
    return output;
  }

  getWeights(): { weights: Float32Array, biases: Float32Array } {
    return { weights: this.weights, biases: this.biases };
  }

  setWeights(w: { weights: Float32Array, biases: Float32Array }): void {
    this.weights = w.weights;
    this.biases = w.biases;
  }
}

export class NeuralNetwork {
  private layers: (ConvLayer | MaxPoolLayer | DenseLayer)[] = [];

  addConv(numFilters: number, kernelSize: number, inputDepth: number, stride: number = 1): this {
    this.layers.push(new ConvLayer(numFilters, kernelSize, inputDepth, stride));
    return this;
  }

  addMaxPool(poolSize: number = 2, stride: number = 2): this {
    this.layers.push(new MaxPoolLayer(poolSize, stride));
    return this;
  }

  addDense(inputSize: number, outputSize: number, activation: 'relu' | 'softmax' | 'sigmoid' | 'none' = 'relu'): this {
    this.layers.push(new DenseLayer(inputSize, outputSize, activation));
    return this;
  }

  predict(input: Tensor): Float32Array {
    let current: Tensor | Float32Array = input;
    let isFlat = false;

    for (const layer of this.layers) {
      if (layer instanceof ConvLayer) {
        current = layer.forward(current as Tensor);
      } else if (layer instanceof MaxPoolLayer) {
        current = layer.forward(current as Tensor);
      } else if (layer instanceof DenseLayer) {
        if (!isFlat && (current as Tensor).shape) {
          current = (current as Tensor).data;
          isFlat = true;
        }
        current = layer.forward(current as Float32Array);
      }
    }

    return current as Float32Array;
  }

  exportWeights(): string {
    const weights: any[] = [];
    for (const layer of this.layers) {
      if (layer instanceof ConvLayer) {
        const w = layer.getWeights();
        weights.push({
          type: 'conv',
          filters: w.filters.map(f => ({
            data: Array.from(f.data),
            shape: f.shape
          })),
          biases: Array.from(w.biases)
        });
      } else if (layer instanceof DenseLayer) {
        const w = layer.getWeights();
        weights.push({
          type: 'dense',
          weights: Array.from(w.weights),
          biases: Array.from(w.biases)
        });
      } else if (layer instanceof MaxPoolLayer) {
        weights.push({ type: 'maxpool' });
      }
    }
    return JSON.stringify(weights);
  }

  importWeights(weightsJson: string): void {
    const weights = JSON.parse(weightsJson);
    let layerIdx = 0;
    
    for (const w of weights) {
      const layer = this.layers[layerIdx];
      if (w.type === 'conv' && layer instanceof ConvLayer) {
        layer.setWeights({
          filters: w.filters.map((f: any) => ({
            data: new Float32Array(f.data),
            shape: f.shape
          })),
          biases: new Float32Array(w.biases)
        });
      } else if (w.type === 'dense' && layer instanceof DenseLayer) {
        layer.setWeights({
          weights: new Float32Array(w.weights),
          biases: new Float32Array(w.biases)
        });
      }
      layerIdx++;
    }
  }
}
