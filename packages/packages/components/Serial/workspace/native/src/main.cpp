#include "Begin.action.h"
#include "Send.action.h"
#include "Receive.action.h"
#include "End.action.h"

// Declared in manifest.yaml as build.register — called once from the generated
// firmware glue (hio_components_register()), same hook as GPIO/Servo/Delay.
extern "C" void hio_register_serial() {

	static BeginAction   beginAction;
	static SendAction    sendAction;
	static ReceiveAction receiveAction;
	static EndAction     endAction;

	HIOSDK::RegisterCenter::instance().registerAction(&beginAction);
	HIOSDK::RegisterCenter::instance().registerAction(&sendAction);
	HIOSDK::RegisterCenter::instance().registerAction(&receiveAction);
	HIOSDK::RegisterCenter::instance().registerAction(&endAction);

}
