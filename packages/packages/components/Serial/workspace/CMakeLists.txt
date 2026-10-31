set(SERIAL_SOURCES
	native/src/main.cpp
	native/src/Begin.action.cpp
	native/src/Send.action.cpp
	native/src/Receive.action.cpp
	native/src/End.action.cpp
)

add_library(serial STATIC ${SERIAL_SOURCES})

target_include_directories(serial PUBLIC native/include)

target_link_libraries(serial PUBLIC hio_sdk)
