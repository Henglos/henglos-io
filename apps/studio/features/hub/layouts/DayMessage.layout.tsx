import { TypingTextEffect } from "@henglosio/ui";

export const DayMessageLayout = () => {

	const messages = [
		"Resisting without losing calm.",
		"Current status: operational.",
		"Keep your mind grounded.",
		"Less noise, more clarity.",
		"Stable energy, stable mind.",
		"Processing ideas...",
		"Stay connected to what matters.",
		"High voltage, low worries.",
		"No grounding, no peace.",
		"Every connection matters.",
		"System online and breathing.",
		"Balance is power.",
		"Small signals, big ideas.",
		"Avoid unnecessary overload.",
		"Circuits aligned.",
		"Keep the flow light.",
		"Updating thoughts...",
		"Every detail supports the system.",
		"Temperature under control.",
		"Not every bug is a problem.",
		"Powered on, stable, and ready.",
		"More stability, fewer crashes.",
		"Everything flows better when connected.",
		"Power without balance doesn't last.",
		"Strong signal, calm mind.",
		"Small sparks move big ideas.",
		"It's not a bug, it's advanced behavior.",
		"If nobody understands it, it must be cutting-edge technology.",
		"Sometimes the system just needs coffee.",
		"Works better after a reboot.",
		"Everything is under control... probably.",
		"The system has its moments.",
		"It's not slow, it's processing with care.",
		"It didn't freeze, it's reflecting.",
		"The system is exploring possibilities.",
		"Productivity mode: enabled.",
		"Today is a good day to build."
	];

	return (

		<div className="flex items-center justify-center py-16 px-12 w-full">

			<TypingTextEffect
				text={messages.at(Math.floor(Math.random() * messages.length ))!}
				loop={false}
				className="text-[72px] leading-20 text-fg"
				cursorCharacter="_"
				cursorClassName="text-accent-fg"
			/>

		</div>

	);

}
