
// Module Node.js natif pour DXGI Desktop Duplication
// À compiler avec node-gyp

#include <node.h>
#include <node_buffer.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <vector>

using namespace v8;

class DXGICapture {
private:
    ID3D11Device* device = nullptr;
    ID3D11DeviceContext* context = nullptr;
    IDXGIOutputDuplication* duplication = nullptr;
    
public:
    DXGICapture() {
        Initialize();
    }
    
    ~DXGICapture() {
        Cleanup();
    }
    
    bool Initialize() {
        // Créer le device D3D11
        D3D_FEATURE_LEVEL featureLevel;
        HRESULT hr = D3D11CreateDevice(
            nullptr,
            D3D_DRIVER_TYPE_HARDWARE,
            nullptr,
            0,
            nullptr,
            0,
            D3D11_SDK_VERSION,
            &device,
            &featureLevel,
            &context
        );
        
        if (FAILED(hr)) return false;
        
        // Obtenir l'adaptateur DXGI
        IDXGIDevice* dxgiDevice = nullptr;
        hr = device->QueryInterface(__uuidof(IDXGIDevice), (void**)&dxgiDevice);
        if (FAILED(hr)) return false;
        
        IDXGIAdapter* dxgiAdapter = nullptr;
        hr = dxgiDevice->GetAdapter(&dxgiAdapter);
        dxgiDevice->Release();
        if (FAILED(hr)) return false;
        
        // Obtenir l'output
        IDXGIOutput* dxgiOutput = nullptr;
        hr = dxgiAdapter->EnumOutputs(0, &dxgiOutput);
        dxgiAdapter->Release();
        if (FAILED(hr)) return false;
        
        // Créer la duplication
        IDXGIOutput1* dxgiOutput1 = nullptr;
        hr = dxgiOutput->QueryInterface(__uuidof(IDXGIOutput1), (void**)&dxgiOutput1);
        dxgiOutput->Release();
        if (FAILED(hr)) return false;
        
        hr = dxgiOutput1->DuplicateOutput(device, &duplication);
        dxgiOutput1->Release();
        
        return SUCCEEDED(hr);
    }
    
    void Cleanup() {
        if (duplication) duplication->Release();
        if (context) context->Release();
        if (device) device->Release();
    }
    
    std::vector<unsigned char> CaptureFrame() {
        std::vector<unsigned char> result;
        
        IDXGIResource* desktopResource = nullptr;
        DXGI_OUTDUPL_FRAME_INFO frameInfo;
        
        // Acquérir la frame
        HRESULT hr = duplication->AcquireNextFrame(100, &frameInfo, &desktopResource);
        if (FAILED(hr)) return result;
        
        // Obtenir la texture
        ID3D11Texture2D* texture = nullptr;
        hr = desktopResource->QueryInterface(__uuidof(ID3D11Texture2D), (void**)&texture);
        desktopResource->Release();
        
        if (SUCCEEDED(hr)) {
            D3D11_TEXTURE2D_DESC desc;
            texture->GetDesc(&desc);
            
            // Créer une texture staging pour lire les données
            desc.Usage = D3D11_USAGE_STAGING;
            desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
            desc.BindFlags = 0;
            
            ID3D11Texture2D* stagingTexture = nullptr;
            hr = device->CreateTexture2D(&desc, nullptr, &stagingTexture);
            
            if (SUCCEEDED(hr)) {
                context->CopyResource(stagingTexture, texture);
                
                // Mapper la texture pour lecture
                D3D11_MAPPED_SUBRESOURCE mapped;
                hr = context->Map(stagingTexture, 0, D3D11_MAP_READ, 0, &mapped);
                
                if (SUCCEEDED(hr)) {
                    // Copier les pixels (BGRA -> RGBA)
                    size_t imageSize = desc.Width * desc.Height * 4;
                    result.resize(imageSize);
                    
                    unsigned char* src = (unsigned char*)mapped.pData;
                    unsigned char* dst = result.data();
                    
                    for (UINT y = 0; y < desc.Height; y++) {
                        for (UINT x = 0; x < desc.Width; x++) {
                            size_t srcIdx = y * mapped.RowPitch + x * 4;
                            size_t dstIdx = (y * desc.Width + x) * 4;
                            
                            dst[dstIdx + 0] = src[srcIdx + 2]; // R
                            dst[dstIdx + 1] = src[srcIdx + 1]; // G
                            dst[dstIdx + 2] = src[srcIdx + 0]; // B
                            dst[dstIdx + 3] = src[srcIdx + 3]; // A
                        }
                    }
                    
                    context->Unmap(stagingTexture, 0);
                }
                
                stagingTexture->Release();
            }
            
            texture->Release();
        }
        
        duplication->ReleaseFrame();
        return result;
    }
};

static DXGICapture* captureInstance = nullptr;

void CaptureDesktop(const FunctionCallbackInfo<Value>& args) {
    Isolate* isolate = args.GetIsolate();
    
    if (!captureInstance) {
        captureInstance = new DXGICapture();
    }
    
    std::vector<unsigned char> imageData = captureInstance->CaptureFrame();
    
    if (imageData.empty()) {
        isolate->ThrowException(Exception::Error(
            String::NewFromUtf8(isolate, "Failed to capture frame").ToLocalChecked()
        ));
        return;
    }
    
    Local<Object> buffer = node::Buffer::Copy(
        isolate,
        (char*)imageData.data(),
        imageData.size()
    ).ToLocalChecked();
    
    args.GetReturnValue().Set(buffer);
}

void Initialize(Local<Object> exports) {
    NODE_SET_METHOD(exports, "captureDesktop", CaptureDesktop);
}

NODE_MODULE(dxgi_capture, Initialize)
