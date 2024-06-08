#include <node.h>
#include <unistd.h>
#include <cstdio>

namespace demo {

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Value;
using v8::Number;

void addc_register_as_worker(const FunctionCallbackInfo<Value>& args) {
  Isolate* isolate = args.GetIsolate();
  // long ret = syscall(454, 0);

  long ret = 0;
  printf("[%d] registers as worker\n", ::getpid());
  args.GetReturnValue().Set(Number::New(isolate, ret));
}

void addc_checkin(const FunctionCallbackInfo<Value>& args) {
  int cpuid_success = 0;
  Isolate* isolate = args.GetIsolate();

  //asm volatile (
  //  "cpuid"
  //  : "=b"(cpuid_success)
  //  : "a"(KVM_CPUID_ADDC_CHECKIN)
  //  : "%rdx"
  //);

  printf("[%d] checks in\n", ::getpid());
  args.GetReturnValue().Set(Number::New(isolate, cpuid_success));
}

void Initialize(Local<Object> exports) {
  NODE_SET_METHOD(exports, "addc_register_as_worker", addc_register_as_worker);
  NODE_SET_METHOD(exports, "addc_checkin", addc_checkin);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)

}