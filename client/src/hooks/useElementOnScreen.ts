import { RefObject, useEffect, useRef, useState } from "react"

export const useElementOnScreeen = <T extends HTMLElement>(options: IntersectionObserverInit): [RefObject<T>, boolean] => {
    const containerRef = useRef<T>(null);
    const [isVisible, setIsVisible] = useState<boolean>(false);

    const callbackFunction: IntersectionObserverCallback = (entries: any) => {
        const [entry]: [IntersectionObserverEntryInit] = entries;
        setIsVisible(entry.isIntersecting);
    }

    useEffect(() => {
        const observer = new IntersectionObserver(callbackFunction, options);
        if (containerRef.current) observer.observe(containerRef.current);

        return () => {
            if (containerRef.current) observer.unobserve(containerRef.current);
        }
    }, [containerRef, options]);

    return [containerRef, isVisible];
}