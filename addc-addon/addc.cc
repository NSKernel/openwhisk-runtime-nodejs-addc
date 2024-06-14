#include <node.h>
#include <unistd.h>
#include <cstdio>

#define KVM_CPUID_ADDC_REG_WORKER       0x4000000f                             
#define KVM_CPUID_ADDC_CHECKIN          0x40000010                   
#define KVM_CPUID_ADDC_RET_WORKER       0x40000011                   
#define KVM_CPUID_ADDC_REG_MAIN         0x40000012                    
#define KVM_CPUID_ADDC_DEREGISTER       0x40000013

namespace demo {

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Value;
using v8::Number;

void addc_register(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  long ret = syscall(455, 0);
  if (ret == 0)
    printf("[%d] registered\n", ::getpid());
  else
    printf("[%d] failed to register\n", ::getpid());
  args.GetReturnValue().Set(Number::New(isolate, ret));
}

void addc_deregister(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  long ret = syscall(456, 0);
  if (ret == 0)
    printf("[%d] deregistered\n", ::getpid());
  else
    printf("[%d] failed to deregister\n", ::getpid());
  args.GetReturnValue().Set(Number::New(isolate, ret));
}

void addc_register_as_worker(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  long ret = syscall(454, 0);
  if (ret != 0)
    printf("[%d] failed to register as worker to guest\n", ::getpid());
  else {
    asm volatile (
      "cpuid"
      : "=b"(ret)
      : "a"(KVM_CPUID_ADDC_REG_WORKER)
      : "%rdx"
    );
    if (ret != 0)
      printf("[%d] failed to register as worker to host\n", ::getpid());
    else
      printf("[%d] registered as worker to host\n", ::getpid());
  }
    
  args.GetReturnValue().Set(Number::New(isolate, ret));
}

void addc_checkin(const FunctionCallbackInfo<Value>& args) {
  int cpuid_success = 0;
  Isolate* isolate = args.GetIsolate();

  asm volatile (
    "cpuid"
    : "=b"(cpuid_success)
    : "a"(KVM_CPUID_ADDC_CHECKIN)
    : "%rdx"
  );

  if (cpuid_success == 0)
    printf("[%d] checks in\n", ::getpid());
  else
    printf("[%d] failed to check in\n", ::getpid());
  args.GetReturnValue().Set(Number::New(isolate, cpuid_success));
}

void Initialize(Local<Object> exports) {
  NODE_SET_METHOD(exports, "addc_register", addc_register);
  NODE_SET_METHOD(exports, "addc_deregister", addc_deregister);
  NODE_SET_METHOD(exports, "addc_register_as_worker", addc_register_as_worker);
  NODE_SET_METHOD(exports, "addc_checkin", addc_checkin);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)

}