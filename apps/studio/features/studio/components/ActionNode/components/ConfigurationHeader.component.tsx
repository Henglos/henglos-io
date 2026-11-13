import { useSelectedAction } from "@/features/studio/hooks/useSelectedAction";
import { Breadcrumb, Text } from "@henglosio/ui";

export const ConfigurationHeader = () => {

	const { count, component, action } = useSelectedAction();

	return (

		<section className="flex flex-col gap-2 px-4 h-10 justify-center shrink-0 border-b border-line">

			{count === 1 && component && action ? (
				<Breadcrumb.Root>
					<Breadcrumb.Item>
						<Text size="md">{component.alias}</Text>
					</Breadcrumb.Item>
					<Breadcrumb.Item current>
						<Text size="md">{action.alias}</Text>
					</Breadcrumb.Item>
				</Breadcrumb.Root>
			) : (
				<Text variant="low" size="xs">
					{count === 0 ? "No action selected" : `${count} actions selected`}
				</Text>
			)}

		</section>

	);

}
